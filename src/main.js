
let value=0;
const messages=[
"Loading Character...",
"Loading Clock Tower...",
"Preparing Skeleton...",
"Preparing Textures...",
"Entering World..."
];

const timer=setInterval(()=>{
 value++;
 document.getElementById("progress").style.width=value+"%";
 document.getElementById("percent").innerText=value+"%";
 document.getElementById("status").innerText=messages[Math.min(Math.floor(value/20),4)];
 if(value>=100){
  clearInterval(timer);
  document.getElementById("loading").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
 }
},35);
