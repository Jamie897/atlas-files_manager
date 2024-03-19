const { v4: uuidv4 } = require('uuid');
const mongodb = require('mongodb');
const fsp = require('fs').promises;
const fs = require('fs');
const mime = require('mime-types');
const Mongo = require('../utils/db');
const Redis = require('../utils/redis');
const { fileQueue } = require('../worker');

async function getUserIdFromToken(token) {
    const userIdString = await Redis.get(`auth_${token}`);
    if (!userIdString) {
        throw new Error('Unauthorized');
    }
    return new mongodb.ObjectID(userIdString);
}

class FilesController {
    static async postUpload(req, res) {
        const token = req.header('X-Token');
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const userId = await getUserIdFromToken(token);
            const { name, type, data, isPublic = false } = req.body;
            let { parentId = '0' } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Missing name' });
            }
            if (!['folder', 'file', 'image'].includes(type)) {
                return res.status(400).json({ error: 'Missing type' });
            }
            if (!data && type !== 'folder') {
                return res.status(400).json({ error: 'Missing data' });
            }

            if (parentId !== '0') {
                parentId = new mongodb.ObjectID(parentId);
                const parent = await Mongo.db.collection('files').findOne({ _id: parentId, userId });
                if (!parent || parent.type !== 'folder') {
                    return res.status(400).json({ error: 'Invalid parent' });
                }
            } else {
                parentId = 0;
            }

            const newFile = {
                userId,
                name,
                type,
                isPublic,
                parentId,
            };

            if (type === 'image') {
                await fileQueue.add({
                    userId: userId.toString(),
                    fileId: newFile.insertedId.toString(),
                });
            }

            let result;
            if (type === 'folder') {
                result = await Mongo.db.collection('files').insertOne(newFile);
            } else if (type === 'file' || type === 'image') {
                const fileData = Buffer.from(data, 'base64');
                const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
                await fsp.mkdir(folderPath, { recursive: true });
                const filePath = `${folderPath}/${uuidv4()}`;
                await fsp.writeFile(filePath, fileData);
                newFile.localPath = filePath;
                result = await Mongo.db.collection('files').insertOne(newFile);
            }

            return res.status(201).json({
                id: result.insertedId.toString(),
                userId: userId.toString(),
                name,
                type,
                isPublic,
                parentId: parentId === 0 ? '0' : parentId.toString(),
                localPath: result.localPath || '',
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Server error' });
        }
    }

    static async getShow(req, res) {
        const fileId = req.params.id;
        const token = req.header('X-Token');

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const userId = await getUserIdFromToken(token);
            const file = await Mongo.db.collection('files').findOne({
                _id: new mongodb.ObjectID(fileId),
                userId,
            });

            if (!file) {
                return res.status(404).json({ error: 'Not found' });
            }

            return res.status(200).json(file);
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            return res.status(500).json({ error: 'Server error' });
        }
    }

    static async getIndex(req, res) {
        const token = req.header('X-Token');

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        let userId;
        try {
            userId = await getUserIdFromToken(token);
        } catch (error) {
            console.error(error);
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { parentId = '0', page = '0' } = req.query;
        const skip = parseInt(page, 10) * 20;

        try {
            const matchQuery = { userId };
            if (parentId !== '0') {
                matchQuery.parentId = new mongodb.ObjectID(parentId);
            } else {
                matchQuery.parentId = '0';
            }

            const files = await Mongo.db.collection('files').aggregate([
                { $match: matchQuery },
                { $skip: skip },
                { $limit: 20 },
            ]).toArray();

            const responseFiles = files.map((file) => ({
                id: file._id,
                userId: file.userId,
                name: file.name,
                type: file.type,
                isPublic: file.isPublic,
                parentId: file.parentId,
            }));

            return res.status(200).json(responseFiles);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Server error' });
        }
    }

    static async putPublish(req, res) {
        const fileId = req.params.id;
        const token = req.header('X-Token');

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const userId = await getUserIdFromToken(token);
            const file = await Mongo.db.collection('files').findOneAndUpdate(
                { _id: new mongodb.ObjectID(fileId), userId },
                { $set: { isPublic: true } },
                { returnOriginal: false },
            );

            if (!file.value) {
                return res.status(404).json({ error: 'Not found' });
            }

            return res.status(200).json(file.value);
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            return res.status(500).json({ error: 'Server error' });
        }
    }

    static async putUnpublish(req, res) {
        const fileId = req.params.id;
        const token = req.header('X-Token');

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const userId = await getUserIdFromToken(token);
            const file = await Mongo.db.collection('files').findOneAndUpdate(
                { _id: new mongodb.ObjectID(fileId), userId },
                { $set: { isPublic: false } },
                { returnOriginal: false },
            );

            if (!file.value) {
                return res.status(404).json({ error: 'Not found' });
            }

            return res.status(200).json(file.value);
        } catch (error) {
            console.error(error);
            if (error.message === 'Unauthorized') {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            return res.status(500).json({ error: 'Server error' });
        }
    }

    static async getFile(req, res) {
        const fileId = req.params.id;
        const token = req.header('X-Token');

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const userId = await getUserIdFromToken(token);
            const file = await Mongo.db.collection('files').findOne({
                _id: new mongodb.ObjectID(fileId),
                $or: [
                    { userId: new mongodb.ObjectID(userId) },
                    { isPublic: true }
                ]
            });

            if (!file) {
                return res.status(404).json({ error: 'Not found' });
            }

            if (file.type === 'folder') {
                return res.status(400).json({ error: "A folder doesn't have content" });
            }

            if (!fs.existsSync(file.localPath)) {
                return res.status(404).json({ error: 'Not found' });
            }

            res.type(mime.lookup(file.name) || 'application/octet-stream');
            fs.createReadStream(file.localPath).pipe(res);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: 'Server error' });
        }
    }
}

module.exports = FilesController;
