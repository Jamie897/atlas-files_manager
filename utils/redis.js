// utils/redis.js

const redis = require('redis');

class RedisClient {
    constructor() {
        this.client = redis.createClient();

        this.client.on('error', (err) => {
            console.error('Redis error:', err);
        });
    }

    isAlive() {
        return this.client.connected;
    }

    async get(key) {
        return new Promise((resolve, reject) => {
            this.client.get(key, (err, reply) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(reply);
            });
        });
    }

    async set(key, value, durationInSeconds) {
        return new Promise((resolve, reject) => {
            this.client.setex(key, durationInSeconds, value, (err, reply) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(reply);
            });
        });
    }

    async del(key) {
        return new Promise((resolve, reject) => {
            this.client.del(key, (err, reply) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(reply);
            });
        });
    }
}

const redisClient = new RedisClient();

module.exports = redisClient;