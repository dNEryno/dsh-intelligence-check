package check

import (
	"math"
	"regexp"
	"strconv"
	"strings"
)

// The milk question asks for a height in inches, and models answer it in every
// notation imaginable: "46.24 inches", "\boxed{46.24\text{ inches}}", or a
// result restated in feet afterwards ("about 3 feet 10.24 inches"). Grading one
// literal token therefore rejects correct answers, so four signals are tried in
// order of authority: an explicit \boxed{} value may only confirm the answer, an
// explicit answer marker decides either way, then the last number that carries an
// inch unit, then the last number in the text.

const milkAnswer = 46.24

// Grading compares three leading significant figures, so 46.2, 46.24 and 46.2426
// all count as the same answer at different precision.
const milkDigits = 3

var (
	boxedPattern   = regexp.MustCompile(`(?s)\\boxed\s*\{((?:[^{}]|\{[^{}]*\})*)\}`)
	latexCommand   = regexp.MustCompile(`\\[a-zA-Z]+`)
	thousandsMark  = regexp.MustCompile(`(\d),(\d{3})`)
	answerMarker   = regexp.MustCompile(`(?i)(?:final\s+answer|answer|结论|答案|因此|所以|thus|therefore)\s*(?:is|was|would\s+be|为|是|=|:|：)?\s*([^\n]{0,80})`)
	numberWithUnit = regexp.MustCompile(`(?i)([0-9]+(?:[.,][0-9]+)?)\s*(?:inches|inch|英寸)`)
	anyNumber      = regexp.MustCompile(`[0-9]+(?:[.,][0-9]+)?`)
)

// Grade decides whether an automatically graded answer solved the question.
// Questions other than milk stay for manual review.
func Grade(id, answer string) string {
	if id != "milk" {
		return "manual"
	}
	for _, value := range boxedValues(answer) {
		if isMilkAnswer(value) {
			return "passed"
		}
	}
	plain := normalize(answer)
	if value, ok := markedValue(plain); ok {
		return verdict(value)
	}
	if value, ok := lastValue(numberWithUnit.FindAllString(plain, -1)); ok {
		return verdict(value)
	}
	if value, ok := lastValue(anyNumber.FindAllString(plain, -1)); ok {
		return verdict(value)
	}
	return "failed"
}

// normalize removes the markup that sits between a number and its unit, so
// "\boxed{46.24\text{ inches}}" reads like "46.24 inches".
func normalize(answer string) string {
	answer = strings.ReplaceAll(answer, "**", " ")
	answer = strings.ReplaceAll(answer, "$", " ")
	answer = strings.ReplaceAll(answer, "`", " ")
	answer = latexCommand.ReplaceAllString(answer, "")
	answer = strings.NewReplacer("{", " ", "}", " ", "\\", " ").Replace(answer)
	return thousandsMark.ReplaceAllString(answer, "$1$2")
}

// boxedValues collects the numbers inside \boxed{} groups, newest first. Authors
// use the box to mark a final answer, and models also box intermediate results, so
// the caller only accepts a box that agrees instead of trusting it blindly.
func boxedValues(answer string) []float64 {
	groups := boxedPattern.FindAllStringSubmatch(answer, -1)
	values := make([]float64, 0, len(groups))
	for index := len(groups) - 1; index >= 0; index-- {
		inner := normalize(groups[index][1])
		value, ok := firstValue(numberWithUnit.FindAllString(inner, -1))
		if !ok {
			value, ok = firstValue(anyNumber.FindAllString(inner, -1))
		}
		if ok {
			values = append(values, value)
		}
	}
	return values
}

// markedValue reads the number right after the last explicit answer marker. That
// number is what the model claims as its result, so it decides the verdict even
// when an earlier draft mentions the right value. The first candidate in the tail
// wins, because a restatement in feet trails the real answer.
func markedValue(plain string) (float64, bool) {
	marks := answerMarker.FindAllStringSubmatch(plain, -1)
	if len(marks) == 0 {
		return 0, false
	}
	tail := marks[len(marks)-1][1]
	if value, ok := firstValue(numberWithUnit.FindAllString(tail, -1)); ok {
		return value, true
	}
	return firstValue(anyNumber.FindAllString(tail, -1))
}

func firstValue(matches []string) (float64, bool) {
	for _, match := range matches {
		if value, ok := parseNumber(match); ok {
			return value, true
		}
	}
	return 0, false
}

func lastValue(matches []string) (float64, bool) {
	for index := len(matches) - 1; index >= 0; index-- {
		if value, ok := parseNumber(matches[index]); ok {
			return value, true
		}
	}
	return 0, false
}

func parseNumber(raw string) (float64, bool) {
	value, err := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(raw), ",", "."), 64)
	if err != nil {
		return 0, false
	}
	return value, true
}

func verdict(value float64) string {
	if isMilkAnswer(value) {
		return "passed"
	}
	return "failed"
}

func isMilkAnswer(value float64) bool {
	return roundSignificant(value) == roundSignificant(milkAnswer)
}

func roundSignificant(value float64) float64 {
	if value == 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	scale := math.Pow(10, float64(milkDigits-1)-math.Floor(math.Log10(math.Abs(value))))
	return math.Round(value*scale) / scale
}
