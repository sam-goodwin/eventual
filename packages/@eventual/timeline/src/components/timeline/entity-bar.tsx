import { TimelineEntity } from "../../entity.js";
import { ExecutionProperties } from "../../execution.js";
import styles from "./entity-bar.module.css";

const palette = [
  "crimson",
  "portland-orange",
  "persian-green",
  "june-bud",
  "flickr-pink",
  "canary",
  "light-salmon",
];

export function EntityBar({
  executionProperties,
  entity,
}: {
  executionProperties: ExecutionProperties;
  entity: TimelineEntity;
}) {
  const start = percentOffset(
    new Date(entity.rootEvent.timestamp).getTime(),
    executionProperties.start.getTime(),
    executionProperties.latest.getTime()
  );
  const end = entity.leafEvents[0]
    ? new Date(entity.leafEvents[0].timestamp).getTime()
    : start;
  const width =
    percentOffset(
      end,
      executionProperties.start.getTime(),
      executionProperties.latest.getTime()
    ) - start;
  return (
    <div
      key={
        "seq" in entity.rootEvent ? entity.rootEvent.seq : entity.rootEvent.id
      }
      className={styles["entity-bar"]}
      style={{
        left: `${start}%`,
        width: `${width.toFixed(2)}%`,
        backgroundColor: `var(--${
          palette[Math.floor(Math.random() * palette.length)]
        })`,
      }}
    >
      <div className={styles["entity-bar-name"]}>
        {"name" in entity.rootEvent
          ? entity.rootEvent.name
          : entity.rootEvent.type}
      </div>
      <div className={styles["entity-bar-duration"]}>{end - start}ms</div>
    </div>
  );
}

function percentOffset(timestamp: number, start: number, end: number) {
  return (100 * (timestamp - start)) / (end - start);
}
