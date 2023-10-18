import hipaa from "../cdk.out/HIPAA.Security-eventual-tests-NagReport.json" assert { type: "json" };
import awsSolutions from "../cdk.out/HIPAA.Security-eventual-tests-NagReport.json" assert { type: "json" };

type Report = typeof hipaa | typeof awsSolutions;

report([hipaa]);

function report(report: Report[]) {
  const errors = report.flatMap((report) => report.lines);

  const nonCompliant = errors.filter(
    (line) => line.compliance === "Non-Compliant"
  );
  const compliant = errors.filter((line) => line.compliance === "Compliant");
  type Violation = (typeof nonCompliant)[number];

  console.log("# Non-compliant");
  printErrors(nonCompliant);
  console.log("# Compliant");
  printErrors(compliant);

  function printErrors(error: Violation[]) {
    const uniqueErrors = Array.from(
      new Set(error.map((line) => format(line.ruleInfo)))
    );
    console.log(uniqueErrors.sort().join("\n"));
  }

  function format(line: string) {
    return `- [ ] ${line.replace(/- \(Control.*/g, "")}`;
  }
}
