// This file exports the logo as an attachment for nodemailer emails
const path = require('path');

module.exports = {
  filename: 'logoo.png',
  path: path.join(__dirname, '../admin/logoo.png'),
  cid: 'companylogo'
};
