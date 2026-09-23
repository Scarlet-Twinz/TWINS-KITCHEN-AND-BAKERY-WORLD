const API=(window.TWINS_API_BASE||"http://localhost:8000").replace(/\/$/,"");
const form=document.getElementById("ownerLogin");
const email=document.getElementById("email");
const password=document.getElementById("password");
const submit=document.getElementById("submit");
const message=document.getElementById("message");

function showMessage(text){
  message.textContent=text;
  message.style.display="block";
}

form.addEventListener("submit",async(event)=>{
  event.preventDefault();
  message.style.display="none";
  const emailValue=email.value.trim();
  const passwordValue=password.value;
  if(!emailValue||!passwordValue){
    showMessage("Email and password are required.");
    return;
  }
  submit.disabled=true;
  submit.textContent="Signing in…";
  try{
    const response=await fetch(API+"/api/auth/login",{
      method:"POST",
      credentials:"include",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email:emailValue,password:passwordValue})
    });
    let data={};
    try{data=await response.json()}catch{}
    if(!response.ok){
      throw new Error(data.detail||"Authentication failed.");
    }
    if(!data.user||data.user.role!=="owner"){
      showMessage("Owner access required.");
      return;
    }
    window.location.href="/admin/media/";
  }catch(error){
    showMessage(error.message||"Authentication failed.");
  }finally{
    submit.disabled=false;
    submit.textContent="Sign in";
  }
});
