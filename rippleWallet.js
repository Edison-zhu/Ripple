const RippleAPI = require('ripple-lib').RippleAPI;
const WebSocket = require('ws');
const ipaddress = "wss://s2.ripple.com:443";//"wss://s-west.ripple.com"; //服务器是瑞波官方搭建
const instructions = {maxLedgerVersionOffset:5};
const INTERVAL = 1000;
const api = new RippleAPI({server:ipaddress});
const ratio = 0.000001;
const subTag = "Example watch Bitstamp's hot wallet/";


api.on('error', (errorCode, errorMessage) => {
    console.log(errorCode + ': ' + errorMessage);
});

api.on('connected', () => {
    console.log('api connected');
});

api.on('disconnected', () => {
    console.log('disconnected');
});

var apiPromise = api.connect().then(() => {
    console.log("开始连接!");
});

const ws = new WebSocket(ipaddress);
var notifyMap = new Map();

function parsePushData(data,listenAccount)
{
    var xrpPushInfo = {'dirct':1};//3忽略
    if(data.hasOwnProperty('transaction'))
    {
        var transaction = data.transaction;
        if(data.hasOwnProperty('type') && data.type == "transaction" && transaction.TransactionType == "Payment")
        {
            if (listenAccount != transaction.Destination && listenAccount == transaction.Account){
               // xrpPushInfo['dirct'] = 0; //出账通知放开这句，在注释下面一句就也能监听出帐消息了,放开就报错
                return xrpPushInfo;
            }
            else if(listenAccount == transaction.Destination){
                xrpPushInfo['dirct'] = 1;//进账通知
            }else{
                return xrpPushInfo;
            }
            var bsuccess = false;
            if(data.validated && data.meta.TransactionResult == 'tesSUCCESS'){
                bsuccess = true;
            }
            xrpPushInfo['account']=transaction.Account;
            xrpPushInfo['amount']=String(transaction.Amount*ratio);
            xrpPushInfo['destination']=transaction.Destination;
            xrpPushInfo['destinationTag']=transaction.DestinationTag;
            xrpPushInfo['fee']= String(transaction.Fee*ratio);
            xrpPushInfo['hash']=transaction.hash;
            xrpPushInfo['date']=transaction.date;
            xrpPushInfo['code']=data.meta.TransactionResult;
            xrpPushInfo['validated']=data.validated;
            xrpPushInfo['success']=bsuccess;
        }
    }
    return xrpPushInfo;
}


function parserPayMent(data) {
    var xrpResult = {'success':false};
    if(data.hasOwnProperty('type') && data.type == 'payment' &&
        data.hasOwnProperty('specification') && data.hasOwnProperty('outcome') &&
        data.outcome.result == 'tesSUCCESS'){
        xrpResult['hash']=data.id;
        xrpResult['src_address']=data.specification.source.address;
        xrpResult['src_tag'] = data.specification.source.tag;
        xrpResult['des_address']=data.specification.destination.address;
        xrpResult['des_tag'] = data.specification.destination.tag;
        xrpResult['times'] = data.outcome.timestamp;
        xrpResult['fee'] = data.outcome.fee;
        xrpResult['account'] = data.outcome.deliveredAmount.value;
        xrpResult['currency'] = data.outcome.deliveredAmount.currency;

        xrpResult['success']=true;
    }
    return xrpResult;
}

function xrpVerifyTransaction(hash, options,bRecursionFind) {
    console.log('Verifing Transaction');
    return api.getTransaction(hash, options).then(data => {
        //return data.outcome.result === 'tesSUCCESS';
        return parserPayMent(data);
    }).catch(error => {
        if (error instanceof api.errors.PendingLedgerVersionError) {
            return new Promise((resolve, reject) => {
                setTimeout(() => xrpVerifyTransaction(hash, options)
                    .then(resolve, reject), INTERVAL);
            });
        }
        return error;
    });
}

ws.onmessage = function(evt) {

    console.log('recv a msg from ripple server!');
    if(evt.data.hasOwnProperty('id') && evt.data.id == subTag)
        return;
    var data = JSON.parse(evt.data);
    for(var key in notifyMap)
    {
        console.log(key);
        var result = parsePushData(data,key)
        console.log(result);
        if(result['dirct'] != 1)
        {
            notifyMap[key](result);
            break;
        }

    }
};

ws.onclose = function(evt) {
    console.log("Ws Connection closed.");
};


/**
 * @brife 封装瑞波币钱包功能 支持订阅钱包转账推送。支持XRP转账
 * @param address 钱包地址
 * @param secret  钱包密钥
 * @param tagnum  钱包转账时设置得TAG
 * @param accountObserver 用于监听钱包事件得回调
 **/
var xrpWallet = function(address,secret,tagnum,accountObserver){

    srcAddress_ = address;
    secret_ = secret;
    userTag_ = tagnum;
    accountObserver_= accountObserver;

    this.xrpInit = function () {
        var json = {
            "id": subTag,
            "command": "subscribe",
            "accounts": [srcAddress_]
        }
        ws.onopen = function(evt) {
            console.log("ws Connection open ...");
            var string = JSON.stringify(json)
            notifyMap[srcAddress_] = accountObserver_;
            ws.send(string);
        };
    }

    /**
     * @brife 钱包转账历史账单
     * @param successCall 查询成功回调
     * @param failedCall 查询失败回调
     * @param options 可选参数 可参考“https://ripple.com/build/rippleapi/”
     */
    this.xrpGetTransactions = function(successCall,failedCall,options){
        apiPromise.then(()=>{
            return  api.getLedger().then(version =>{
                //var options ={
                //    'maxLedgerVersion':version.ledgerVersion,
                //    'counterparty':srcAddress_,
                //    'limit':50,
                //    //'start':'415F9F4E665E6F83857AF7502DC051078737F634CCB86F3FD26CD8BE6B4217DB',
                //    'excludeFailures':true,
                //    'earliestFirst':false,
                //    'types':['payment']
                //};
                options.maxLedgerVersion=version.ledgerVersion;
                return api.getTransactions(srcAddress_,options).then(transaction => {
                    successCall(transaction);
                }).catch(err=>{failedCall(err);});
            });
        });
    }

    /**
     * @brife 钱包余额查询
     * @param successCall 查询成功回调
     * @param failedCall 查询失败回调
     */
    this.xrpGetBalances = function(successCall,failedCall){
        apiPromise.then(() => {
            return api.getBalances(srcAddress_).then(balances =>{
                successCall(balances);});
        }).catch(err=>{failedCall(err);});
    }

    /**
     * @brife xrp转账
     * @param destAddress 接收方地址
     * @param value 转账金额
     * @param bSrcFee true表示手续费由当前钱包付出，false表示手续费由收款方付出
     * @param successCall 查询成功回调
     * @param failedCall 查询失败回调
     **/
    this.xrpPayment = function(destAddress,value,bSrcFee,successCall,failedCall){
        apiPromise.then(() => {
            return api.getFee().then(fee =>{
                var val = String(value-fee);
                if(bSrcFee === false)
                    val = String(value);
                var pay={
                    source:{
                        address:srcAddress_,
                        tag:userTag_,
                        maxAmount:{
                            value:val,
                            currency:"XRP"
                        }
                    },
                    destination:{
                        address:destAddress,
                        tag:userTag_,
                        amount:{
                            value:val,
                            currency:"XRP"
                        }
                    }
                };
                return api.preparePayment(srcAddress_, pay, instructions).then(prepared =>{
                    return  api.getLedger().then(ledger =>{
                        var ret = api.sign(prepared.txJSON,secret_);
                        return api.submit(ret.signedTransaction).then(result =>{
                            const options={
                                minLedgerVersion: ledger.ledgerVersion,
                                maxLedgerVersion: prepared.instructions.maxLedgerVersion
                            };
                            return new Promise((resolve, reject) =>{
                                setTimeout(() => xrpVerifyTransaction(ret.id, options).then(resolve, reject), INTERVAL);});
                        });
                    });
                });
            });
        }).then(result=>{successCall(result);}).catch(err=>{failedCall(err)});
    }
};

module.exports = xrpWallet;
