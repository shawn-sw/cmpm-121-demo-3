import "./style.css";

const APP_NAME = "D3";
const app = document.querySelector<HTMLDivElement>("#app")!;
document.title = APP_NAME;

const button = document.createElement("button");
app.append(button);
button.textContent = "Click";
button.onclick = () => alert("You clicked the button!");

button.className = "button"; 
