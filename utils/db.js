// utils/db.js

const { MongoClient } = require('mongodb');

class DBClient {
    constructor() {
        const host = process.env.DB_HOST || 'localhost';
        const port = process.env.DB_PORT || 27017;
        const database = process.env.DB_DATABASE || 'files_manager';
        const uri = `mongodb://${host}:${port}`;

        this.client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
        this.database = database;
    }

    async connect() {
        try {
            await this.client.connect();
            console.log('Connected to MongoDB');
        } catch (err) {
            console.error('Error connecting to MongoDB:', err);
        }
    }

    async isAlive() {
        return this.client.isConnected();
    }

    async nbUsers() {
        const usersCollection = this.client.db(this.database).collection('users');
        return usersCollection.countDocuments();
    }

    async nbFiles() {
        const filesCollection = this.client.db(this.database).collection('files');
        return filesCollection.countDocuments();
    }
}

const dbClient = new DBClient();

module.exports = dbClient;
