var timelineSwiper = new Swiper ('.timeline .swiper-container', {
  direction: 'vertical',
  loop: false,
  speed: 1600,
  pagination: '.swiper-pagination',
  paginationBulletRender: function (swiper, index, className) {
    // console.log(index)
    // console.log("break")
    var year = document.querySelectorAll('.swiper-slide')[index].getAttribute('data-year');
    var cont = document.getElementsByClassName('container')
    
    // switch (index) {
    //   case 0:
    //     var color = 'rgb(232, 74, 39)';
    //     cont[0].style.backgroundColor = color
    //   case 1:
    //     var color = 'rgb(0,0,0)'
    //     cont[0].style.backgroundColor = color
    // }
    // if (index == 0) {
    //   var color = 'rgb(232, 74, 39)';
    //   cont[0].style.backgroundColor = color
    // } else if (index == 1) {
    //   var color = 'rgb(0,0,0)'
    //   cont[0].style.backgroundColor = color
    // }
    return '<span class="' + className + '">' + year + '</span>';
  },
  
  paginationClickable: true,
  nextButton: '.swiper-button-next',
  prevButton: '.swiper-button-prev',
  breakpoints: {
    768: {
      direction: 'horizontal',
    }
  }
});

// document.getElementById("container").style.color =
// var container = document.getElementById(".swiper-container");
// container.style.background-color = "red";
