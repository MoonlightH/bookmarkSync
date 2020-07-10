let iconImage = {
    '19': 'images/bookmark_19.png',
    '38': 'images/bookmark_38.png'
}

//登录状态,-1找不到token跳转登录页面、0找到token但无法登录、1找到token并且能正常登录
var loginStatus = -1

//获取token
let token = localStorage.getItem('token');

if (token == null){
    loginStatus = -1
}

if (token != null) {
    var time1 = window.setInterval(auth(token),100000)

}

function retryAuth(auth, times, delay) {
    return new Promise(function (resolve,reject) {
        function attempt() {
            auth(token).then(resolve).catch(function (error) {
                console.log('还有${times}次尝试')
                if(times == 0){
                    reject(error)
                }else {
                    times --
                    setTimeout(attempt, delay)
                }
            })
        }
        attempt()
    })
}

function auth(token) {
    let promise = new Promise(function (resolve, reject) {
        //登录鉴权,加入定时重试防止api.github.com间歇性不可用
        fetch('https://api.github.com',{
            method: 'GET',
            headers: {
                'Authorization': token
            }
        }).then(function (response) {
            //正常执行
            if(response.status == 200){
                loginStatus = 1
                chrome.browserAction.setIcon({
                    'path': iconImage
                })
                resolve()
            }
            if (response.status == 403){

            }
            if (response.status == 401){

            }

        }).catch(function (error) {
            reject(error)
        })
    })

    return promise
}

