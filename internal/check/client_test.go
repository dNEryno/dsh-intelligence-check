package check

import "testing"

// The samples marked "record" are copies of answers the plugin actually stored, and
// every one of them used to be graded "failed" even though the model wrote 46.24.
func TestGradeMilkNotation(t *testing.T) {
	for _, tt := range []struct{ name, answer, want string }{
		{"bare value", "46.24", "passed"},
		{"inches spelled out", "Answer: **46.24 inches**.", "passed"},
		{"latex boxed", `\boxed{46.24\text{ inches}}`, "passed"},
		{"record: boxed then restated in feet",
			"Adding 4.2426 to 42 gives 46.2426.\n\n\\boxed{46.24\\text{ inches}}\n\nEquivalently, about 3 feet 10.24 inches.", "passed"},
		{"record: boxed inside a sentence",
			"So the new height is $\\boxed{46.24\\ \\text{inches}}$ in total.", "passed"},
		{"record: bare marker with trailing feet",
			"The answer is 46.24 inches, which is about 3 feet 10.24 inches.", "passed"},
		{"four significant figures", "46.236 inches", "passed"},
		{"three significant figures", "46.2 inches", "passed"},
		{"wrong value", "48.00 inches", "failed"},
		{"wrong value in a box", `\boxed{48\text{ inches}}`, "failed"},
		{"correct value dismissed", "46.24 inches is incorrect. Final: 48 inches.", "failed"},
		{"correct value only mentioned", "Example: 46.24, but my final answer is 48.", "failed"},
		{"intermediate boxed result does not veto a correct answer",
			"\\boxed{0.3536}\n\nFinally, the answer is 46.24 inches.", "passed"},
		{"no number at all", "I cannot solve this problem.", "failed"},
		{"empty answer", "", "failed"},
	} {
		if got := Grade("milk", tt.answer); got != tt.want {
			t.Errorf("%s: Grade(milk, %q) = %s, want %s", tt.name, tt.answer, got, tt.want)
		}
	}
}

func TestGradeOnlyGradesMilk(t *testing.T) {
	for _, id := range []string{"milk", "recite", "html", "map"} {
		if id == "milk" {
			continue
		}
		if got := Grade(id, "46.24 inches"); got != "manual" {
			t.Errorf("Grade(%s) = %s, want manual", id, got)
		}
	}
}
