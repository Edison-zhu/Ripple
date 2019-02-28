const RippleApi = require("ripple-lib").RippleAPI;
const api = new RippleApi({server:'wss://s1.ripple.com'});

//创建Xrp账户
const generated = api.generateAddress();
console.log(generated.address);
console.log(generated.secret);
api.connect();
api.getTransactions("rUg8zSZMqT7DCN7ff9Sjv3HA5Vm2c7jDDj").then(transactions=>{
    console.log(transactions);
})
api.connect().then(()=>{
   // const generated = api.generateAddress();
    const myAddress = 'rUg8zSZMqT7DCN7ff9Sjv3HA5Vm2c7jDDj';
    console.log('getting account info '+ myAddress)
    return api.getAccountInfo(myAddress);

}).then(info =>{
    console.log('xrp 瑞波余额:'+info.xrpBalance);
    console.log('账户数量：'+info.ownerCount);
    console.log('getAccountInfo done');
}).then(()=>{
    return api.disconnect();
}).then(()=>{
    console.log('连接关闭');
}).catch(console.error);
