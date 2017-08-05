var db = require('diskdb');
db = db.connect('./database', ['users']);
require('dotenv').config();
const fetch = require("node-fetch");
var request = require('request');
const base64 = require('base-64');

var ROOT_API_URL = 'http://api.root.co.za/v1';
const headers = 
  { 'Authorization' : 'Basic ' + base64.encode(`${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`),
    'Content-Type' : 'application/json'
  };

const getConfigVariables = (sponsorId) =>  
  fetch(`${ROOT_API_URL}/sponsors/${sponsorId}/root-code`, { headers })
        .then(r=>r.json())
        .then(r=>r.config_variables);


const updateConfigVariables = (sponsorId, config_variables) => 
 fetch(`${ROOT_API_URL}/sponsors/${sponsorId}/config-variables`, { headers, method: 'POST', body: JSON.stringify({config_variables})})
 .then(r=>r.json());
 


// This function adds a user to a sponsor item's config variable `users`
// The config variable `users` is a comma separated string of user ids
exports.addUserToConfigVariables = (userId, sponsorId) => 
  getConfigVariables(sponsorId).then(variables => {
      var users = variables.users || {};
      var balances = variables.balances || {};

      // Add userId to users
      users[userId] = true;      
      balances[userId] = 0

      return updateConfigVariables(sponsorId, { users, balances });         
  }).then(r=>{console.log(r); return Promise.resolve(r)});

exports.adjustUserBalances = (amount, sponsorId) => 
  getConfigVariables(sponsorId).then(variables => {
    
      var users = variables.users || {};
      var balances = variables.balances || {};
      
      Object.keys(users).forEach((user) => {
        if (!balances[user]) {
          balances[user] = amount;
        } else {
          balances[user] += amount;
        }
        balances[user] = balances[user] >= 0 ? balances[user] : 0;
      });

      return updateConfigVariables(sponsorId, {users,balances});      
  });

// This function removes a user from a sponsor item's config variable `users`
exports.removeUserFromConfigVariables = (userId, sponsorId) => 
  getConfigVariables(sponsorId).then(variables => {
      var users = variables.users || {};
      var balances = variables.balances || {};      

      if (balances[userId]) {
        delete balances[userId];
      }
      if(users[userId]){
        delete users[userId];
      }

      return updateConfigVariables(sponsorId, {users, balances});

  });



// This function adds a user to a sponsor item's config variable `users`
// The config variable `users` is a comma separated string of user ids
exports.adjustUserBalanceConfigVariable = (userId, amount, sponsorId) => 
  getConfigVariables(sponsorId).then(variables => {    
      var users =  variables.users || {};
      var balances = variables.balances || {};            
      balances[userId] += amount;
      balances[userId] = balances[userId] < 0 ? 0 : balances[userId]; 
      return updateConfigVariables(sponsorId, { users, balances });      
  });


// Get a user's access token with the authcode obtained through OAuth
exports.getAccessToken = authCode => 
  fetch('https://api.root.co.za/v1/oauth/token', {method: 'POST', headers, body: JSON.stringify({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: process.env.OAUTH_REDIRECT_URL,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
  })}).then(r=>r.json());
