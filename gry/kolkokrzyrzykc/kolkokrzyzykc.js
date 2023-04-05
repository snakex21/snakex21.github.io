$(document).ready(function() {

  function startGame() {
    
     clearBox("one");
     clearBox("two");
     clearBox("three");
     clearBox("four");
     clearBox("five");
     clearBox("six");
     clearBox("seven");
     clearBox("eight");
     clearBox("nine");
  
   
    if (Math.random() < 0.5) {
    document.turn = "X";} else {
      document.turn="O";
    }
    document.winner = null; 
    setMsg(document.turn + " gets to start. Good Luck!");
   

  }

  function setMsg(msg) {
    var elem = document.getElementById("message");
    elem.innerText = msg;
    elem.style.color = "black";
    $(elem).removeClass("blinking");
  }

  function setAlr(msg) {
    var elem = document.getElementById("message");
    elem.innerText = msg;
    elem.style.color = "blue";
    $(elem).removeClass("blinking");
  }
  function blinker() {
    $('.blinking').fadeOut(500);
    $('.blinking').fadeIn(500);
  }
  setInterval(blinker, 1000);

  function setWarn(msg) {
    var elem = document.getElementById("message");
    elem.innerText = msg;
    elem.style.color = "red";
    $(elem).addClass("blinking");
  }
  
  function setCongs(msg) {
    var elem = document.getElementById("message");
    elem.innerText = msg;
    elem.style.color = "green";
   
  }

  function switchTurn() {
  
    if (checkForWinner(document.turn)) {
      document.winner=document.turn;
      setCongs("Congratulations! " + document.turn + " is the winner!");
    
     }
   
    else if (checkForDraw()) {
      setCongs("It is a draw");
      document.winner ="D";
      //console.log(checkForDraw());
      //console.log(getBox("three"));
    }
   else 
     
    if (document.turn == 'X') {
      document.turn = "O";
      setMsg("It's " + document.turn + "'s turn");
    } else {
      document.turn = "X";
      setMsg("It's " + document.turn + "'s turn");
    }

  }

  startGame();

  $("#start").click(function() {
    
    startGame();
  })
  
  $(".col-xs-4").click(function() {
   if (document.winner == "D") {setAlr ("Game already over. It was a draw.")}
    
    else
    if (document.winner != null) {setAlr(document.turn + " already won the game");}
    else if ($(this).html() === "") {
      $(this).html(document.turn);
      switchTurn();
    } else {
      setWarn("That square has already been used");
    }
  });

  function getBox(number) {
    return document.getElementById(number).innerText;
  }

  function checkRow(a, b, c, move) {
    var result = false;
    if (getBox(a) == move && getBox(b) == move && getBox(c) == move) {
      result = true;
    }
    return result;
  }

  function checkForDraw() {
  var result = false;
   if ((getBox("one") !=="") && (getBox("two") !=="") && (getBox("three") !=="")  && (getBox("four") !=="") && (getBox("five") !=="") && (getBox("six") !=="")
  && (getBox("seven") !=="") && (getBox("eight") !=="") && (getBox("nine") !=="")    
      
      ) {
     //console.log(getBox("one"));
     //console.log(getBox("two"));
     //conosole.log(getBox("three"));
     
     
     result = true;
   }
    return result;
  }
  
    
    
    
  function checkForWinner(move) {
    var result = false;
    if (checkRow("one", "two", "three", move) ||
      checkRow("four", "five", "six",move) ||
      checkRow("seven", "eight", "nine", move) ||
      checkRow("one", "four", "seven", move) ||
      checkRow("two", "five", "eight", move) ||
      checkRow("three", "six", "nine", move) ||
      checkRow("one", "five", "nine", move) ||
      checkRow("three", "five", "seven", move))

    {
      result = true;
    }

    return result;

  }
  
  function clearBox(number) {
  document.getElementById(number).innerText=""; 
    
  }

});