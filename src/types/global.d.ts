declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }

  var webkitSpeechRecognition: any;
  var SpeechRecognition: any;
}

export {};