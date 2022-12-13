import { isScheduledEvent } from "@eventual/core";
import { TimelineEntity } from "../../entity.js";
import { ExecutionProperties } from "../../execution.js";
import { EntityBar } from "./entity-bar.js";
import styles from "./timeline.module.css";

export function Timeline({
  entities,
  executionProperties,
}: {
  entities: TimelineEntity[];
  executionProperties: ExecutionProperties;
}) {
  return (
    <div className={styles["timeline-wrapper"]}>
      <div className={styles["timeline-container"]}>
        <div className={styles.scale}>
          {Array.from({ length: 11 }, (_, i) => (
            <div
              key={i}
              className={styles["marker-wrapper"]}
              style={{
                left: `${i * 10}%`,
              }}
            >
              <div>
                scaleSize ?{" "}
                {Math.floor(
                  (i *
                    (executionProperties.latest.getTime() -
                      executionProperties.start.getTime())) /
                    10
                )}
                ms
              </div>
              <div className={styles.marker} />
            </div>
          ))}
        </div>
        {entities.map((entity) => {
          if (isScheduledEvent(entity.rootEvent)) {
            return (
              <EntityBar
                entity={entity}
                executionProperties={executionProperties}
              />
            );
          } else {
            return undefined;
            // return <EntityPoint entity={entity} />;
          }
        })}
      </div>
    </div>
  );
}
