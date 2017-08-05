require('dotenv').config();
var bodyParser = require('body-parser');
var express = require('express');
var app = express();
var hogan = require('hogan-express');
var path = require('path');

var db = require('diskdb');
db = db.connect('./database', ['users', 'sponsor_payments', 'events']);

var users = require('./helpers/users');
var { getRandValue } = require('./helpers/money-methods');


var Pusher = require('pusher');
var pusher = new Pusher({
  appId: '375211',
  key: 'b189220d550c56f9e80b',
  secret: '380291124452d49810bc',
  cluster: 'eu',
  encrypted: true
});

var PUSHER_CHANNEL = process.env.CLIENT_ID;

var logAndNotify = function(message) {
  pusher.trigger(PUSHER_CHANNEL, 'notify', { message });
  console.log(message);
};

app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: false }));

var CLIENT_ID = process.env.CLIENT_ID;
var CLIENT_SECRET = process.env.CLIENT_SECRET;
var OAUTH_REDIRECT_URL = process.env.OAUTH_REDIRECT_URL;
var OAUTH_URL = 'https://api.root.co.za/v1/oauth/authorize?redirect_uri=' + OAUTH_REDIRECT_URL + '&client_id=' + CLIENT_ID + '&response_type=code';
var MAX_SPEED = 120;

// Set up view engine
app.set('view engine', 'html');
app.engine('html', hogan);
app.set('views', path.resolve(__dirname, 'views'));

// Serve static files from public folder
app.use(express.static(__dirname + '/public'));

//==========================================================//
//======================= HOME PAGE ========================//
//==========================================================//

// Serve homepage
app.get('/', function (req, res) {
  res.render('index', { // => /views/index.html
    // Variables go here and gets included in view as {{ name }}
    client_id: process.env.CLIENT_ID,
    pusher_channel: process.env.CLIENT_ID,
    oauth_url: OAUTH_URL,
  });
});

//==========================================================//
//===================== OAUTH ENDPOINT =====================//
//==========================================================//

// This is specified as our app's redirect_uri on Root.
// The user is redirected here after the oauth process.
// We store the user's details in our database.
app.get('/callback', function(req, res) {
  var params = req.query;
  
  // If Oauth error, log the error
  if (params.error) {
    console.error('OAUTH ERROR: ' + JSON.stringify(params.error));
  } else {
    // Store user in database
    var user = {
      first_name: params.first_name,
      last_name: params.last_name,
      email: params.email,
      user_id: params.user_id,
      balance: 0
    };
    db.users.update({ user_id: params.user_id }, user, { upsert: true });

    logAndNotify('New user: ' + params.first_name + ' ' + params.last_name);

    // Get and store user's access token
    users.getAccessToken(params.code).then(data => {
        user.access_token = data.access_token;
        user.refresh_token = data.refresh_token;
        db.users.update({ user_id: user.user_id }, user);
    });
  }

  // Redirect user to home page
  res.redirect('/?user_id=' + params.user_id);
});



const adjustBalance = (transaction) => {
    let user = db.users.findOne({user_id: transaction.user_id});
    
    return users.adjustUserBalanceConfigVariable(transaction.user_id, transaction.sponsor_amount,transaction.sponsor_id).then(_ => {     
          let balance = (user.balance + transaction.sponsor_amount) < 0 ? 0 : (user.balance + transaction.sponsor_amount);           
          db.users.update({ user_id: transaction.user_id }, { balance });               
          return Promise.resolve({});
    });     
};


//==========================================================//
//============== SPONSOR WEBHOOK HANDLER ===================//
//==========================================================//

// This endpoint is specified as our sponsor item's redirect url
// on Root. It is POSTed to after a sponsor payment is paid out
// or an error occurred in the sponsorPayment function.
app.post('/webhooks/sponsors', function(req, res) {
  var data = req.body;
  var userId = data.user_id;
  var sponsorId = data.sponsor_id;
  var sponsorAmount = data.sponsor_amount;
  var transactionId = data.transaction_id;
  var error = data.error;
  
  if (error) {
    console.error('SPONSOR ERROR: ' + JSON.stringify(error));
  } else {
    var transaction = {
      user_id: userId,
      sponsor_id: sponsorId,
      sponsor_amount: -sponsorAmount,
      transaction_id: transactionId,
    };
    console.log(transaction);
    db.sponsor_payments.save(transaction);        
    adjustBalance(transaction).then(_=> logAndNotify('User spent money'))
  }

  res.status(200);
  res.send();
});

//==========================================================//
//================== USER APP ENDPOINTS ====================//
//==========================================================//

// Return all the users that have OAuth'ed with
// our app and are stored in our database.
app.get('/users', function(req, res) {
  res.json(db.users.find());
});

app.post('/users/:user_id/approve', (req,res)=> {
  let userData = db.users.find({ user_id: req.params.user_id });  
  if (userData) {      
    // Reset balance. 
    userData.balance = 0;
    if(req.body.state === true){
        users.addUserToConfigVariables(req.params.user_id, process.env.SPONSOR_ID).then(_ => {        
            db.users.update({ user_id: req.params.user_id }, { approved:  true });
            logAndNotify('User added to sponsor');
        });  
    }else{
        users.removeUserFromConfigVariables(req.params.user_id, process.env.SPONSOR_ID).then(_ =>{          
            db.users.update({ user_id: req.params.user_id }, { approved: false });
            logAndNotify('User removed from sponsor');
            userData.approved = req.body.state;
            res.status(200);
          }
        );     
    }    
    res.send(userData);
  }else{
    res.status(404);
    res.send();
  }    
});

// Needed for initial handshake
app.head('/trello/webhook',(req,res)=>{
  res.status(200);
  res.send();
});


const adjustBalances = (amount) =>       
    users.adjustUserBalances(amount, process.env.SPONSOR_ID).then( _ => {
        let users = db.users.find();
        users.forEach((user) => {
          user.balance += amount;
          user.balance = user.balance > 0 ? user.balance : 0;
          db.users.update({user_id: user.user_id},user);
        });             
    });



app.post('/trello/webhook', (req,res) => {
  if(req.body.action && req.body.action 
     && req.body.action.data
     && req.body.action.type === "updateCard"
     && req.body.action.data.listBefore)
  {    
    let prevName = req.body.action.data.listBefore.name;
    let nextName = req.body.action.data.listAfter.name;
    let valuePerCompletedCard = 10*100 // Sponsor ten rand per completed card
    let amount = 0
    if((prevName==='Backlog' || prevName==='In Progress') && nextName === 'Done'){
      // Moved to done
      amount = valuePerCompletedCard;
    }else if(prevName === 'Done' && ((nextName==='Backlog' || nextName==='In Progress'))){
      // Moved from done      
      amount = -valuePerCompletedCard;
    }

    if(amount!==0){
      adjustBalances(amount).then(_=>{
          if(amount>0){
            logAndNotify('Task complete. The beer fund is getting bigger');
          }else{
            logAndNotify('Task moved back. The beer fund is getting smaller');
          }
      });
      
    }    
    
  }
  res.status(200);
  res.send();
});



app.listen(3000, function () {
  console.log('App starting on port 3000!')
});
