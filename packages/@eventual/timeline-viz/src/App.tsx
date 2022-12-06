import { useQuery } from "@tanstack/react-query";
import ky from "ky";

function App() {
  const { data: events } = useQuery(
    ["events"],
    () => ky("/timeline").json<TimelineActivity[]>(),
    { refetchInterval: 5000 }
  );

  if (!events) {
    return <div>No events</div>;
  } else {
    return (
      <div style={{ width: "100vw", minHeight: "100vh", textAlign: "center" }}>
        <h1>Timeline</h1>
        <div style={{ display: "flex" }}>
          {events.map((event) => (
            <div
              style={{
                background: "blue",
                color: "white",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div>{event.name}</div>
              <div>
                {"completed" in event.status
                  ? `${event.status.completed}ms`
                  : "-"}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
}

export default App;

interface TimelineActivity {
  type: "activity";
  seq: number;
  name: string;
  start: Date;
  status: { completed: number } | { failed: Date } | { inprogress: true };
}
