if (typeof (Storage) !== "undefined"){
    // localStorage.setItem("name","jiangpeng")
} else {
    console.log("localStorage not support!")
}

document.getElementById("p1").innerHTML = localStorage.getItem("name")