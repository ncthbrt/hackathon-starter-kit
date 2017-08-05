
// Wrap alertify into custom function
function customAlert() {
  var content = Array.from(arguments).join(' ');
  alertify.logPosition("top right");
  alertify.maxLogItems(15).delay(3000).log(content);
}

// Fetch all authenticated users from server
function fetchUsers(callback) {
  $.get('/users').done(function(data) {
    callback(data);
  })
  .fail(function(error) {
    alert('Could not fetch users!');
  });
}

function renderUsers(users) {
  if (users.length === 0) {
    return;
  } 
  
  let updateApproval = (user, value) => {
      console.log('its happening');
      $.ajax({
          type: "POST",
          url: `/users/${user.user_id}/approve`,
          // The key needs to match your method's input parameter (case-sensitive).
          data: JSON.stringify({state : value}),
          contentType: "application/json",
          dataType: "json",          
          success: function() {            
              user.approved = value;            
              renderUsers(users);            
          },
          failure: function(errMsg) {
              console.log(failure);
          }
      });            
  };
  
  var $tbody = $('#users-table');
  $tbody.find("tr").remove();      
  users.forEach(function(user) {

    var tr = `<tr>
      <td>${user.first_name} ${user.last_name}</td>
      <td>${user.email}</td>
      <td>${user.user_id}</td>`;
    
      
    if(!user.approved){   
      let buttonId = `approve-${user.userid}`;   
      tr += `<td><div id='${buttonId}' class="btn btn-add btn-primary">Approve</div></td>`;
      $tbody.append(tr+'<tr/>');    
      $('#'+buttonId).click(()=>updateApproval(user, true));
    }else{
      let buttonId = `unapprove-${user.userid}`;   
      tr += `<td><div id='${buttonId}' class="btn btn-remove btn-primary">Unapprove</div></td>`;
      $tbody.append(tr+'<tr/>');    
      $('#'+buttonId).click(()=>updateApproval(user, false));
    }       
  });    
  
}

// Wait for jQuery to load
$(document).ready(function() {

  // Submit once-off events with AJAX
  $("#form-once-off-events").submit(function(event) {
    event.preventDefault();
    var $form = $(this);
    var url = $form.attr('action');
    var user_id = $('#users-dropdown').val();
    var data = $form.serializeArray().reduce(function(obj, item) { obj[item.name] = item.value; return obj; }, {});
    data.user_id = user_id;
    data.time = (new Date()).getTime();

    $.post(url, data).done(function(data) {
      // customAlert(data);
    })
    .fail(function(error) {
      alert('Could not post event!');
    });
  });
});

// ======================== //
// ======== PUSHER ======== //
// ======================== //

var pusher = new Pusher('b189220d550c56f9e80b', {
  cluster: 'eu',
  encrypted: true
});
var channel = pusher.subscribe(PUSHER_CHANNEL);

channel.bind('notify', function(data) {  
  fetchUsers(function(users) {
    var currentUser = users.find(function(user) {
      return user.user_id === userId;
    });

    if (currentUser) {
      $("#iphone").attr('class', 'iphone signed-in');
      $("#greeting").text('Hi ' + ((currentUser.first_name+',') || 'there,'));
      $("#balance").text(`R ${getRandValue(currentUser.balance || 0)}`);
      CURRENT_USER = currentUser;
    }
  });
});

channel.bind('new_user', function(data) {
  customAlert(data.message);
  fetchUsers(function(users) {
    renderUsers(users);
  });
});

// ======================== //
// ========= INIT ========= //
// ======================== //

let getRandValue = (centValue) => {
  const cents = Math.floor(centValue) % 100;
  const centsString = (cents + 100).toString().slice(-2);

  const integer = Math.floor(centValue / 100);
  const reversed = integer.toString().split('').reverse().join('');
  const comma = reversed.replace(/(\d{3})/g, '$1 ').trim().replace(/\s/g, ',');
  const normalComma = comma.split('').reverse().join('');
  return `${normalComma}.${centsString}`;
};

var queryParams = {};
location.search.substr(1).split("&").forEach(function(item) {
  queryParams[item.split("=")[0]] = item.split("=")[1]
});
var userId = queryParams.user_id;

fetchUsers(function(users) {
  renderUsers(users);

  var currentUser = users.find(function(user) {
    return user.user_id === userId;
  });

  if (currentUser) {
    $("#iphone").attr('class', 'iphone signed-in');
    $("#greeting").text('Hi ' + ((currentUser.first_name+',') || 'there,'));
    $("#balance").text(`R ${getRandValue(currentUser.balance || 0)}`);
    CURRENT_USER = currentUser;
  }
});

