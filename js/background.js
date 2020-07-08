//get login name & password
var loginName = localStorage.getItem("loginName");
var password = localStorage.getItem("password");
var iconImageDark = {
    "19":"images/bookmark_dark_19.png",
    "38":"images/bookmark_dark_38.png"
}
if(loginName==null||password==null){
    chrome.browserAction.setIcon({
        "path": iconImageDark
    })
}

//check can login github

