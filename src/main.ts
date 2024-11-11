import "./style.css";

const button = document.createElement("button");
button.textContent = "Click";
button.onclick = () => alert("You clicked the button!");

button.className = "button"; 
