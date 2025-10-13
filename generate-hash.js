const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('กรุณาใส่รหัสผ่านที่ต้องการ: ', (password) => {
    const hash = bcrypt.hashSync(password, 10);
    console.log('\n=================================');
    console.log('Password Hash ของคุณคือ:');
    console.log(hash);
    console.log('=================================');
    console.log('\nนำไปใส่ในไฟล์ .env ที่ ADMIN_PASSWORD_HASH');
    rl.close();
});