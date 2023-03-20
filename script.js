// Data for the videos
const videos = [
    {
      title: "Video Title 1",
      description: "Video Description 1",
      thumbnail: "video1-thumbnail.jpg",
      url: "https://video1.com"
    },
    {
      title: "Video Title 2",
      description: "Video Description 2",
      thumbnail: "video2-thumbnail.jpg",
      url: "https://video2.com"
    },
    // Add more videos as necessary
  ];
  
  // Get the container for the video cards
  const featuredVideos = document.querySelector(".featured-videos");
  
  // Create a video card for each video
  videos.forEach(video => {
    const videoCard = document.createElement("div");
    videoCard.classList.add("video-card");
    videoCard.innerHTML = `
      <a href="${video.url}">
        <img src="${video.thumbnail}" alt="${video.title}" />
        <p>${video.title}</p>
      </a>
    `;
    featuredVideos.appendChild(videoCard);
  });
  
  // Add click event to each video card
  const videoCards = document.querySelectorAll(".video-card");
  
  videoCards.forEach(card => {
    card.addEventListener("click", function() {
      // Get the URL of the video from the "a" element inside the card
      const videoUrl = this.querySelector("a").href;
  
      // Redirect the user to the video page
      window.location.href = videoUrl;
    });
  });

  const videoPlayer = document.querySelector(".video-player");
const zoomInButton = document.createElement("button");
const zoomOutButton = document.createElement("button");

zoomInButton.textContent = "+";
zoomOutButton.textContent = "-";

zoomInButton.addEventListener

function zoomIn(img) {
    if(img.classList.contains("fullscreen")) {
        img.classList.remove("fullscreen");
        img.style.width = "300px";
    } else {
        img.classList.add("fullscreen");
        img.style.width = "100%";
    }
}


// Get all links with class "scroll-to-link"
var links = document.querySelectorAll('.scroll-to-link');

// Loop through each link
links.forEach(function(link) {
  // Add click event listener to each link
  link.addEventListener('click', function(event) {
    event.preventDefault(); // Prevent link from opening URL

    // Get the href of the link
    var href = this.getAttribute('href');

    // Get the element with the ID specified in the href
    var target = document.querySelector(href);

    // Check if target element exists
    if (target) {
      // Get the top position of the target element
      var top = target.getBoundingClientRect().top + window.pageYOffset;

      // Scroll to the top position of the target element
      window.scroll({ top: top, left: 0, behavior: 'smooth' });
    }
  });
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
      e.preventDefault();

      document.querySelector(this.getAttribute('href')).scrollIntoView({
          behavior: 'smooth'
      });
  });
});


function updateClock() {
  var date = new Date();
  var hour = date.getHours();
  var minute = date.getMinutes();
  var second = date.getSeconds();
  var clock = document.getElementById("clock");
  clock.innerHTML = ""; //wyczyszczenie zawartości clock

  var hourDiv = document.createElement("div");
  hourDiv.classList.add("clock-element");
  hourDiv.innerHTML = hour;
  clock.appendChild(hourDiv);

  var minuteDiv = document.createElement("div");
  minuteDiv.classList.add("clock-element");
  minuteDiv.innerHTML = minute;
  clock.appendChild(minuteDiv);

  var secondDiv = document.createElement("div");
  secondDiv.classList.add("clock-element");
  secondDiv.innerHTML = second;
  clock.appendChild(secondDiv);
}
setInterval(updateClock, 1000);





const fileInput = document.querySelector("input[type='file']");
const video = document.querySelector("#my-video");
const videoTitle = document.querySelector(".video-title");

fileInput.addEventListener("change", function() {
    const file = fileInput.files[0];
    videoTitle.textContent = file.name;
    video.src = URL.createObjectURL(file);
});