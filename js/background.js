//插件两种状态图片
const bookmarkIcon = {
    '19': 'images/bookmark_19.png',
    '38': 'images/bookmark_38.png'
}
const bookmarkDarkIcon = {
    '19': 'images/bookmark_dark_19.png',
    '38': 'images/bookmark_dark_38.png'
}
//默认库名称
const defaultRepository = 'bookmarks'
//默认延时重试次数
const defaultRetryTimes = 30
//默认延时重试时间
const defaultDelay = 5000
//默认书签数据文件
const defaultDataFile = 'bookmarks.json'
//默认日志文件
const defaultLogFile = 'bookmarksLog'
//默认日志格式
const DefaultLogStr = '时间：{0},操作：{1},内容：{2}'

//token是否存在，true 存在、false 不存在
let tokenExists = false;
//登录状态: -1 不能连接github或系统错误、 0 账号或密码错误、  1 登录成功
let loginStatus = -1;
//用户的登录名
let login = null;
//获取token
let token = localStorage.getItem('token')
//获取同步时间
let localSyncTime = localStorage.getItem('syncTime')
//错误消息显示
let errorMessage = null

Base64.extendString();

//定义日志处理类
class Log {
    constructor() {
        let currentDate = new Date()
        let year = currentDate.getFullYear()
        //js的月份从0开始
        let month = currentDate.getMonth()+1
        this.logFileName = defaultLogFile+year+'-'+month+'.log'
        this.content = ''
    }
    //初始化log
    async init(){
        try {
            let response = await request('https://api.github.com/repos/' + login + '/' + defaultRepository + '/contents/'+this.logFileName,
                RequestMethod.GET, null, token, defaultRetryTimes, defaultDelay)
            this.content = response.data.content.fromBase64()
            this.sha = response.data.sha
        }catch (error) {
            if(error.code == 404){
                this.content = ''
                this.sha = null
            }
        }
    }
    //追加日志
    log(operType,operContent){
        this.content = this.content.concat(String.format(DefaultLogStr, dateFormat(new Date(),'yyyy-MM-dd hh:mm:ss'),
            operType, operContent),'\n')
        return this
    }
    //提交日志
    async submit(message){
        if(this.sha==null){
            await createUpdateGitFile(this.content, this.logFileName, message, null)
        }else{
            await createUpdateGitFile(this.content, this.logFileName, message, this.sha)
        }
    }
}

//创建或更新git上的文件,code 201 创建文件成功、200 修改文件成功、422 更新文件但是没提供sha 、403 鉴权失败没有权限
let createUpdateGitFile = async function(content, path, message, sha){
    let requestBody = new Object()
    requestBody.message = message
    requestBody.content = content.toBase64()
    if(sha!=null){
        requestBody.sha = sha
    }
    return request('https://api.github.com/repos/' + login + '/'  + defaultRepository + '/contents/' + path,
        RequestMethod.PUT, JSON.stringify(requestBody), token, defaultRetryTimes, defaultDelay )
}

function addBookmarkListener() {
    //创建书签事件
    chrome.bookmarks.onCreated.addListener(async(id, bookmark)=>{
        let log = new Log()
        await log.init()
        //直接同步书签就行
        await syncBookmarkFiles()
        log.log(OperType.ADD, JSON.stringify(bookmark))
        await log.submit("添加书签")
    })

    //删除书签事件
    chrome.bookmarks.onRemoved.addListener(async(id, removeInfo)=>{
        let log = new Log()
        await log.init()
        //直接同步书签就行
        await syncBookmarkFiles()
        log.log(OperType.DELETE, JSON.stringify(removeInfo))
        await log.submit("删除书签")
    })

    //移动书签到其他书签夹事件
    chrome.bookmarks.onMoved.addListener(async(id, moveInfo)=>{
        let log = new Log()
        await log.init()
        //位置发生变更先同步线上然后直接用本地覆盖线上
        await syncBookmarkFiles()
        log.log(OperType.UPDATE,JSON.stringify(moveInfo))
        await log.submit("移动书签到其它书签目录")
    })

    //移动书签排序事件
    chrome.bookmarks.onChildrenReordered.addListener(async(id, reorderInfo)=>{
        let log = new Log()
        await log.init()
        //index发生变化直接用本地的去覆盖线上
        await  syncBookmarkFiles()
        log.log(OperType.UPDATE,reorderInfo)
        await log.submit("移动书签的排序")
    })

    //书签修改事件
    chrome.bookmarks.onChanged.addListener(async (id, changeInfo)=>{
        let log = new Log()
        await log.init()
        //解决不存在更新时间，改用创建时间，重新创建相同书签
        let oldBookmark = await new Promise(resolve => {
            chrome.bookmarks.search({id:id}, result=>{
                resolve(result)
            })
        })
        //创建书签本体
        let newBookmark = await new Promise(resolve => {
            chrome.bookmarks.create({parentId:oldBookmark.parentId, title:oldBookmark.title,
                url:oldBookmark.url, index:oldBookmark.index},result=>{
                resolve(result)
            })
        })
        //删除原来书签
        await new Promise(resolve => {
            chrome.bookmarks.remove(oldBookmark.id,result=>{})
        })
        syncBookmarkFiles()
        log.log(OperType.UPDATE,JSON.stringify(newBookmark))
        log.submit("修改书签")
    })
}

//深度优先遍历书签的树结构，返回节点和父文件夹[{parents,node},.....]
let deepTraversal = function(root){
    let nodes = new Array()
    let stack = new Array()
    let parents = new Array()
    stack.push(root)
    while (stack.length!=0){
        let childrenItem = stack.pop()
        if(childrenItem.url!=undefined){
            if(childrenItem.parentId!=parents[parents.length-1].id){
                parents.pop()
            }
            nodes.push({parents:parents.slice(0,parents.length),node:childrenItem})
        }else{
            if(parents.length == 0 || childrenItem.parentId == parents[parents.length-1].id){
                parents.push(childrenItem)
            }else{
                while (parents[parents.length-1].id != childrenItem.parentId){
                    parents.pop()
                }
                parents.push(childrenItem)
            }
        }
        let childrenList = childrenItem.children
        if(childrenList == undefined){
            continue
        }
        for(let i=childrenList.length-1; i >= 0; i--){
            stack.push(childrenList[i])
        }
    }

    return nodes
}

//同步本地和远端书签文件
let syncBookmarkFiles = async function (){
    //线上对象覆盖到本地
    let insertLocal = async function (treeArray){
        for(let i=0;i<treeArray.length;i++){
            let parents = treeArray[i].parents
            let node = treeArray[i].node
            let localLastParentId = '0'
            //跳过根节点，遍历当前书签的父目录看
            for(let j=1;j<parents.length;j++){
                let parentResult = await new Promise(resolve => {
                   chrome.bookmarks.search({title:parents[j].title},results=>{
                       resolve(results)
                   })
                })
                //查不到当前目录需要创建
                if(parentResult.length==0){
                    //查找平级的最后一个文件夹的index
                    let lastDirIndex = await new Promise(resolve => {
                        chrome.bookmarks.getChildren(localLastParentId, results=>{
                            let lastDirIndex = 1
                            for(let k=0; k<results.length; k++){
                                if(results[k].url==undefined){
                                    lastDirIndex = results[k].index
                                }
                            }
                            resolve(lastDirIndex)
                        })
                    })
                    localLastParentId = await new Promise(resolve => {
                        chrome.bookmarks.create({
                            parentId:localLastParentId,
                            index:lastDirIndex,
                            title:parents[j].title
                        },result=>{
                            resolve(result.id)
                        })
                    })
                }else{
                    for(let k=0; k<results.length; k++){
                        //排除和文件夹同名的书签文件
                        if(parentResult[k].dateGroupModified==undefined || parentResult[k].parentId != localLastParentId){
                            continue
                        }
                        localLastParentId = parentResult[k].id
                    }
                }
            }
            //创建书签节点
            await new Promise(resolve => {
                chrome.bookmarks.create({
                    parentId: localLastParentId,
                    title: node.title,
                    url: node.url
                }, result => {
                    resolve(result.id)
                })
            })
        }
    }
    //获取当前浏览器书签数据
    let bookmarksTree = await new Promise(resolve => {
        chrome.bookmarks.getTree( result=>{
            resolve(result)
        })
    })
    let bookmarksStr = JSON.stringify(bookmarksTree)
    //获取github存储的书签数据
    let response = await request('https://api.github.com/repos/' + login + '/' + defaultRepository + '/contents/'+defaultDataFile ,
        RequestMethod.GET, null, token, defaultRetryTimes, defaultDelay)
    //书签数据文件不存在
    if(response.code == 404){
        await createUpdateGitFile(bookmarksStr, defaultDataFile,'首次上传本地书签', null)
        return
    }
    let gitBookmarksStr = response.data.content.fromBase64()
    //线上数据文件内容为空
    if(gitBookmarksStr.replace(/(^\s*)|(\s*$)/g, "") == ""){
        await createUpdateGitFile(bookmarksStr, defaultDataFile,'首次上传本地书签', response.data.sha)
        return
    }

    //分别遍历线上和本地的书签数据
    let gitBookmarksTreeArray = deepTraversal(JSON.parse(gitBookmarksStr)[0])
    let localBookmarksTreeArray = deepTraversal(bookmarksTree[0])

    //求线上和本地书签数据的交集和差集
    let allExistsArray = new Array()
    let localNotExistsArray = new Array()
    let gitNotExistsArray = new Array()
    //本地存在的书签map
    let localExistsMap = new Map()
    for(let i=0; i<localBookmarksTreeArray.length; i++){
        localExistsMap.set(localBookmarksTreeArray[i].node.title+localBookmarksTreeArray[i].node.url,
            localBookmarksTreeArray[i])
    }
    //遍历线上书签和本地对比
    let gitExistsMap = new Map()
    for(let i=0; i<gitBookmarksTreeArray.length; i++){
        let gitBookmarksKey = gitBookmarksTreeArray[i].node.title+gitBookmarksTreeArray[i].node.url
        gitExistsMap.set(gitBookmarksKey,gitBookmarksTreeArray[i])
        if(localExistsMap.has(gitBookmarksKey)){
            let gitBookmarkParents = gitBookmarksTreeArray[i].parents
            let localBookmarkParents = localExistsMap.get(gitBookmarksKey).parents
            //取出本地和线上的对象对比parents是否一致
            if(gitBookmarkParents.length==localBookmarkParents.length){
                let gitBookmarkParentsStr = ''
                for(let i=0; i<gitBookmarkParents.length; i++){
                    gitBookmarkParentsStr = gitBookmarkParentsStr.concat(gitBookmarkParents[i])
                }
                let localBookmarkParentsStr = ''
                for(let i=0; i<localBookmarkParents.length; i++){
                    localBookmarkParentsStr = localBookmarkParentsStr.concat(localBookmarkParents[i])
                }
                //比较parents构成的字符串是否一致
                if(gitBookmarkParentsStr==localBookmarkParentsStr){
                    allExistsArray.push(localExistsMap.get(gitBookmarksKey))
                    continue
                }
            }
            localNotExistsArray.push(gitBookmarksTreeArray[i])
            gitNotExistsArray.push(localExistsMap.get(gitBookmarksKey))
        }else{
            localNotExistsArray.push(gitBookmarksTreeArray[i])
        }
    }
    //遍历本地书签确认线上不存在的书签
    for (let i=0; i<localBookmarksTreeArray.length; i++){
        let localBookmarksKey = localBookmarksTreeArray[i].node.title+localBookmarksTreeArray[i].node.url
        if(!gitExistsMap.has(localBookmarksKey)){
            gitNotExistsArray.push(localBookmarksTreeArray[i])
        }
    }

    //获取本地同步时间
    localSyncTime = localStorage.getItem('syncTime')

    //如果不存在本地同步时间直接将线上书签覆盖到本地
    if(localSyncTime==null){
        await insertLocal(localNotExistsArray)
        let newBookmarksTree = await new Promise(resolve => {
            chrome.bookmarks.getTree( result=>{
                resolve(result)
            })
        })
        newBookmarksTree[1]={syncTime:new Date().getTime()}
        let newBookmarksStr = JSON.stringify(newBookmarksTree)
        await createUpdateGitFile(newBookmarksStr, defaultDataFile, '同步书签数据文件', sha)
        localStorage.setItem('syncTime', new Date().getTime())
        return
    }

    //本地存在线上不存在的书签
    for(let i = 0; i < gitNotExistsArray.length; i ++){
        let node = gitNotExistsArray[i].node
        if(node.dateAdded < localSyncTime){
            chrome.bookmarks.remove(node.id, result=>{})
        }
    }

    //线上存在本地不存在的书签
    for(let i=0; i<localNotExistsArray.length; i++){
        let node = localNotExistsArray[i].node
        let needInsertArray = new Array()
        if(node.dateAdded > localSyncTime){
            needInsertArray.push()
        }
        insertLocal(needInsertArray)
    }

    //本地书签覆盖到线上
    let newBookmarksTree = await new Promise(resolve => {
        chrome.bookmarks.getTree( result=>{
            resolve(result)
        })
    })
    newBookmarksTree[1]={syncTime:new Date().getTime()}
    let newBookmarksStr = JSON.stringify(newBookmarksTree)
    await createUpdateGitFile(newBookmarksStr, defaultDataFile, '同步书签数据文件', response.data.sha)
}

//创建默认库
let createDefaultRepository = async function() {
    let requestBody = '{' +
        '"name" : "'+defaultRepository+'",' +
        '"private" : "true",' +
        '"description" : "Chrome书签同步插件的默认存储库",' +
        '"has_issues" : false,' +
        '"has_wiki" : false' +
        '}'
    let createRepositoryResult
    try{
        createRepositoryResult = await request('https://api.github.com/user/repos', RequestMethod.POST,
            requestBody, token, defaultRetryTimes, defaultDelay)
        //成功创建默认库
        if(createRepositoryResult.code==201){
            await createUpdateGitFile('',defaultDataFile,'创建书签默认数据文件',null)
        }
    }catch (error) {
        if(error.code==403){
            console.log('当前用户的token不存在建库权限')
            return false
        }

    }
    //默认库存在
    if(createRepositoryResult.code==422){
        let dataFileExists = await request('https://api.github.com/repos/' + login + '/'  + defaultRepository + '/contents/' + defaultDataFile ,
            RequestMethod.GET, null, token, defaultRetryTimes, defaultDelay)
        if (dataFileExists.code==404){
            await createUpdateGitFile('',defaultDataFile,'创建书签默认数据文件',null)
        }
    }
    return true

}

let init = async function(){
    if(token !=  null){
        tokenExists = true
    }else {
        tokenExists = false
        return
    }
    //测试能否通过当前token连接github
    let  response = await request('https://api.github.com/user', RequestMethod.GET, null, token,
        defaultRetryTimes, defaultDelay).catch(error=>{
        loginStatus = -1
        chrome.browserAction.setIcon({
            'path': bookmarkDarkIcon
        })
    })
    switch (response.code) {
        case 200:
            loginStatus = 1
            login = response.data.login
            chrome.browserAction.setIcon({
                'path': bookmarkIcon
            })
            break
        case 401:
            loginStatus = 0
            chrome.browserAction.setIcon({
                'path': bookmarkDarkIcon
            })
            break
        default:
            loginStatus = -1
            chrome.browserAction.setIcon({
                'path': bookmarkDarkIcon
            })
            break
    }
    let createRepositoryResult = await createDefaultRepository()
    if(!createRepositoryResult){
        return
    }
    //同步书签文件
    await syncBookmarkFiles()
    //添加书签事件监听
    await addBookmarkListener()
}

init()

let saveToken = function(token){
    localStorage.setItem('token',token)
    init()
}