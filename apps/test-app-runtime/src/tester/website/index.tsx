import { useCallback, useEffect } from "react";
import ReactDOM from "react-dom/client";
import useWebSocket from "react-use-websocket";

const websocketUrl = "[WEBSOCKETURL]";

const App = () => {
  // TODO, make dynamic
  const { sendMessage, lastMessage, readyState } =
    useWebSocket.default(websocketUrl);

  const startWorkflow = useCallback(() => sendMessage(JSON.stringify({})), []);

  useEffect(() => {
    if (lastMessage !== null) {
      console.log(lastMessage);
    }
  }, [lastMessage]);

  useEffect(() => {
    console.log(readyState);
  }, [readyState]);

  return (
    <div>
      <button onClick={startWorkflow}>click me</button>
    </div>
  );
};

const root = ReactDOM.createRoot(document.querySelector("#container")!);
root.render(<App />);
