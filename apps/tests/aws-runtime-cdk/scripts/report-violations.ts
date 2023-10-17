import hipaa from "../cdk.out/HIPAA.Security-eventual-tests-NagReport.json" assert { type: "json" };
import awsSolutions from "../cdk.out/HIPAA.Security-eventual-tests-NagReport.json" assert { type: "json" };

type Report = typeof hipaa | typeof awsSolutions;

report(hipaa);
report(awsSolutions);

function report(report: Report) {
  const nonCompliant = report.lines.filter(
    (line) => line.compliance === "Non-Compliant"
  );
  type Violation = (typeof nonCompliant)[number];

  const byResource = nonCompliant.reduce<{
    [resourceID: string]: Violation[];
  }>((resources, line) => {
    resources[line.resourceId] = resources[line.resourceId] ?? [];
    resources[line.resourceId]!.push(line);
    return resources;
  }, {});

  const resourceIDs = Object.keys(byResource).sort();
  for (const resourceID of resourceIDs) {
    console.log(
      `# ${resourceID
        .replace("eventual-tests/testService", "")
        .replace("eventual-tests/", "")}`
    );
    printErrors(byResource[resourceID]!);
  }

  // printErrors(nonCompliant);

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
