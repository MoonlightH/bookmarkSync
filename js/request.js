function request(url,token) {
    fetch(url,{
        method: 'GET',
        headers: {
            'Authorization': token
        }
    }).then(function (response) {
        //正常执行
        if(response.status == 200){

        }
        //鉴权失败
        if (response.status == 403){

        }
        //认证失败
        if (response.status == 401){

        }

    }).catch(function (error) {
        reject(error)
    })
}