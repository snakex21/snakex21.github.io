const cardColors = ["red", "red", "green", "green", "blue", "blue", "magenta", "magenta", "yellow", "yellow", "bisque", "bisque", "brown", "brown", "cyan", "cyan", "orange", "orange"];

let elements = document.querySelectorAll('div');
elements = [...elements];

let gamesLeft = cardColors.length / 2;
let activeCard = '';
const activeCards = [];
let score = 100;
let startTime;

const clickCard = function () {
   activeCard = this;
   console.log(activeCard);
   activeCard.classList.remove('hidden');

   if (activeCard === activeCards[0]) {
      return;
   }

   if (activeCards.length === 0) {
      activeCards[0] = activeCard;
      return;
   } else {
      elements.forEach(card => card.removeEventListener("click", clickCard));
      activeCards[1] = activeCard;

      setTimeout(function () {
         if (activeCards[0].className === activeCards[1].className) {
            activeCards.forEach(card => card.classList.add("off"))
            elements = elements.filter(card => !card.classList.contains("off"));
            gamesLeft--;
         } else {
            activeCards.forEach(card => card.classList.add("hidden"));
            score -= 5;
         }

         activeCard = "";
         activeCards.length = 0;
         elements.forEach(card => card.addEventListener("click", clickCard));

         if (gamesLeft === 0) {
            const endTime = new Date();
            const totalTime = Math.floor((endTime - startTime) / 1000);
            alert(`WYGRALES! Twój wynik to ${score}% w czasie ${totalTime} sekund.`)
            saveScore(score, totalTime);
            location.reload();
         }
      }, 500);
   }
}

const init = function () {
   elements.forEach(elem => {
      const position = Math.floor(Math.random() * cardColors.length);
      elem.classList.add(cardColors[position]);
      cardColors.splice(position, 1);
   });

   elements.forEach(card => {
   });

   setTimeout(function () {
      elements.forEach(card => {
         card.classList.add("hidden");
         card.addEventListener("click", clickCard);
      });
      startTime = new Date();
   }, 2000);
};

init();

const saveScore = function (score, time) {
   const data = {
      score: score,
      time: time
   };
   localStorage.setItem("score", JSON.stringify(data));
};

const loadScore = function () {
   const data = JSON.parse(localStorage.getItem("score"));
   if (data) {
      const scoreElement = document.querySelector(".score");
      const timeElement = document.querySelector(".time");
      scoreElement.textContent = data.score;
      timeElement.textContent = data.time;
   }
};

loadScore();
