import { render } from "preact";
import "./styles.css";
import { App } from "./app";
import { setupPwa } from "./lib/pwa";

render(<App />, document.getElementById("app")!);
setupPwa();
