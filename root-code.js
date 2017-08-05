function sponsorAmount(transaction, history) {
  var now = new Date();

  var amount = Math.abs(transaction.amount);
  var userId = transaction.user_id;
  var addedUsers = process.env.users;
  
  var balance = process.env.balances[userId];
  
  // Check valid user
  if (addedUsers && !addedUsers[userId]) {
    return 0;
  }

  // Check whether this is a drinking establishment
  if (transaction.merchant.category_code !== 5813) {
    return 0;
  }
  
  // Only sponsor drinking on Fridays
  if(now.getDay() !== 6){
    return 0;
  }
  
  // Return the minimum of the remaining balance 
  // and the transaction amount
  var sponsoredAmount = Math.min(balance,amount);
  
  // minimum allowed to sponsor is 100
  if (sponsoredAmount >= 100){
    return sponsoredAmount;
  }else{
    return 0;
  }

}