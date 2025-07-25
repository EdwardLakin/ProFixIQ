// send-test.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey', // literal string "apikey"
    pass: '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' // replace this
  }
});

const mailOptions = {
  from: 'support@profixiq.com', // must be a verified sender
  to: 'edwardlakin35@gmail.com',
  subject: 'Test Email from SendGrid',
  text: 'This is a test email using SendGrid SMTP.'
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    return console.error('Error sending email:', error);
  }
  console.log('Email sent:', info.response);
});