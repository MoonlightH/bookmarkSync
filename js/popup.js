let tokenExists = chrome.extension.getBackgroundPage().tokenExists
let loginStatus = chrome.extension.getBackgroundPage().loginStatus

if(tokenExists){
    switch (loginStatus) {
        case -1:
            this.infoPage()
            break;
        case 0:
            this.loginPage()
            break;
        case 1:
            this.operationPage()
            break;
    }
}else{
    this.loginPage()
}

function infoPage() {
    document.getElementById('body').innerHTML =
        '不能连接上github'
}

function operationPage() {
    document.getElementById('body').innerHTML =
        '<input type="button" value="同步书签" id="sync">' +
        '<input type="button" value="" id="">' +
        '<input type="button" value="" id="">'
}

function loginPage(){//构造登录页面
    document.getElementById('body').innerHTML =
        '<label for="token">token：</label>' +
        '<input type="text" id="token"/><br/>' +
        '<input type="button"  value="登录" id="login">'
    document.getElementById('login').onclick = function () {
        let token = document.getElementById('token').value
        chrome.extension.getBackgroundPage().saveToken(token)
    }
}