class Response{
    constructor(code,message,data) {
        //200请求正常执行、403鉴权失败、401认证失败、-1其它类型错误
        this.code = code;
        this.message = message;
        this.data = data;
    }
}

//请求方式枚举
let RequestMethod = {
    GET : 'GET',
    POST : 'POST',
    PUT : 'PUT',
    DELETE : 'DELETE',
    HEAD: 'HEAD'
}

//书签的操作类型
let OperType = {
    ADD : 'ADD',
    DELETE : 'DELETE',
    UPDATE : 'UPDATE'
}

//支持重试和延时的fetch请求
let request =  function(url, requestMethod, requestBody, token, retryTimes, delay) {
    return new Promise((resolve, reject) => {
        let requestInit = {
            method: requestMethod,
            headers: {
                'Authorization': 'Bearer ' + token
            },
            body: requestBody
        }
        if(requestMethod==RequestMethod.GET || requestMethod==RequestMethod.HEAD){
            requestInit.body = undefined
        }
        let resp = new Response()
        fetch(url,requestInit).then(response=>{
            resp.code = response.status
            return response.json()
        }).then(data=> {
            //正常执行
            if(resp.code >= 200 && resp.code < 300){
                resp.message = '请求执行成功'
                resp.data = data
                resolve(resp)
            }
            //执行失败
            if (resp.code >= 400 && resp.code < 500){
                resp.message = '请求未能成功执行'
                resolve(resp)
            }
            //服务端异常
            if(resp.code >= 500 && resp.code < 600){
                resp.message = '服务端异常'
                reject(resp)
            }
        }).catch(function (error) {
            if(retryTimes == 0){
                resp.message = '系统错误'
                resp.data = error
                reject(resp)
            }else {
                retryTimes--
                window.setTimeout(()=>{
                    resolve(request(url,requestMethod,requestBody,token,retryTimes,delay))
                }, delay)
            }
        })
    })
}

//字符串格式化
String.format = function () {
    let str = arguments[0]
    for (let i = 0; i < arguments.length; i++){
        let reg = new RegExp('\\{' + i + '\\}','gm')
        str = str.replace(reg, arguments[i+1])
    }
    return str
}

//时间格式化
let dateFormat = function(date, fmt){
    let o = {
        "M+": date.getMonth() + 1,
        "d+": date.getDate(),
        "h+": date.getHours(),
        "m+": date.getMinutes(),
        "s+": date.getSeconds(),
        "q+": Math.floor((date.getMonth() + 3) / 3),
        "S": date.getMilliseconds()
    };
    if (/(y+)/.test(fmt))
        fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (let k in o)
        if (new RegExp("(" + k + ")").test(fmt))
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}