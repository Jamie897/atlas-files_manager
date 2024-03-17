// UsersController
const sha1 = require('sha1'); // for hashing
const mongo = require('mongodb');
const redis = require('../utils/redis');
const dbClient = require('../utils/db');

class UsersController {
  // POST req - new User
  static async postNew(req, res) {
    const { email, password } = req.body;

    // check if email is missing
    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    // check if password is missing
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    // check if the email already exists
    const userExists = await dbClient.users.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: 'Already exist' });
    }

    // hash that pass
    const hashPass = sha1(password);

    // create new user
    const newUser = await dbClient.users.insertOne({
      email,
      password: hashPass,
    });

    // endpoint returns new user w one email and id
    return res.status(201).json({ id: newUser.insertedId, email });
  }

  // GET req - retrieve user from token
  static async getMe(req, res) {
    const token = req.header('X-Token');
    console.log(`Token received: ${token}`);

    try {
      const userIdString = await redis.get(`auth_${token}`);
      console.log(`User ID retrieved from Redis: ${userIdString}`);

      if (!userIdString) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userId = new mongo.ObjectID(userIdString);
      const user = await dbClient.users.findOne({ _id: userId });
      console.log(`User retrieved from DB: ${user}`);

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(200).json({ id: user._id.toString(), email: user.email });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = UsersController;
