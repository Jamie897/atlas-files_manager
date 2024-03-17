// task 9 - image generator
const Bull = require('bull');
const { ObjectId } = require('mongodb');
const imageThumbnail = require('image-thumbnail');
const fs = require('fs');
const dbClient = require('./utils/db');

// create new bull queue
const fileQueue = new Bull('thumbnail generator');

// generate thumbnail based on path/location and options
// store each result on the same location of the original file by appending _<width size>
const createThumbnail = async (path, options) => {
  try {
    const thumbnail = await imageThumbnail(path, options);
    const imgPath = `${path}_${options.width}`; // path for thumbnail image
    await fs.writeFileSync(imgPath, thumbnail);
  } catch (err) {
    console.error(err);
  }
};

fileQueue.process(async (job, done) => {
  const { fileId, userId } = job.data;

  if (!fileId) {
    throw new Error('Missing fileId');
  }
  if (!userId) {
    throw new Error('Missing userId');
  }

  // search DB files collection for document
  // based on fileId and userId
  const fileDoc = await dbClient.db.collection('files').findOne({
    _id: ObjectId(fileId),
    userId: ObjectId(userId),
  });

  if (!fileDoc) {
    throw new Error('File not found');
  }

  // generate thumbnails
  createThumbnail(fileDoc.localPath, { width: 500 });
  createThumbnail(fileDoc.localPath, { width: 250 });
  createThumbnail(fileDoc.localPath, { width: 100 });

  done();
});
