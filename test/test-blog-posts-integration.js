'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the expect syntax available throughout
// this module
const expect = chai.expect;

const {BlogPost} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedBlogPostData() {
  console.info('seeding blog data');
  const seedData = [];

  for (let i=1; i<=10; i++) {
    seedData.push(generateBlogPostData());
  }
  // this will return a promise
  /*
  seedData.forEach(item => {
    console.info("seed data is author.firstName: " + item.author.firstName);
    console.info("seed data is author.lastName: " + item.author.lastName);
    console.info("seed data is content: " + item.content);
    console.info("seed data is title: " + item.title);
    console.info("seed data is created: " + item.created);
    })
    */
  return BlogPost.insertMany(seedData);
}

// generate an object representing a blog post.
// can be used to generate seed data for db
// or request.body data
function generateBlogPostData() {
  return {
    author: {
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName()
      },
    title: faker.lorem.sentence(),
    content: faker.lorem.text()
  };
}


// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure data from one test does not stick
// around for next one
function tearDownDb() {
  console.warn('Deleting database');
  return mongoose.connection.dropDatabase();
}

describe('BlogPost API resource', function() {

  // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedBlogPostData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    return seedBlogPostData();
  });

  afterEach(function() {
    return tearDownDb();
  });

  after(function() {
    return closeServer();
  });

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing posts', function() {
      // strategy:
      //    1. get back all posts returned by the GET request to `/posts`
      //    2. prove res has right status, data type
      //    3. prove the number of posts we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let res;
      return chai.request(app)
        .get('/posts')
        .then(function(_res) {
          // so subsequent .then blocks can access response object
          res = _res;
          expect(res).to.have.status(200);
          // otherwise our db seeding didn't work
          expect(res.body).to.have.lengthOf.at.least(1);
          return BlogPost.count();
        })
        .then(function(count) {
          expect(res.body).to.have.lengthOf(count);
        });
    });


    it('should return posts with right fields', function() {
      // Strategy: Get back all posts, and ensure they have expected keys

      let resPost;
      return chai.request(app)
        .get('/posts')
        .then(function(res) {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.be.a('array');
          expect(res.body).to.have.lengthOf.at.least(1);

          res.body.forEach(function(post) {
            expect(post).to.be.a('object');
            expect(post).to.include.keys(
              'id', 'author', 'title', 'content', 'created');
          });
          resPost = res.body[0];
          return BlogPost.findById(resPost.id);
        })
        .then(function(post) {

          expect(resPost.id).to.equal(post.id);
          expect(resPost.author).to.contain(post.author.firstName);
          expect(resPost.author).to.contain(post.author.lastName);
          expect(resPost.content).to.equal(post.content);
          expect(resPost.title).to.equal(post.title);
        });
    });
  });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the blog entry we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new blog entry', function() {

      const newBlogPost = generateBlogPostData();

      return chai.request(app)
        .post('/posts')
        .send(newBlogPost)
        .then(function(res) {
          expect(res).to.have.status(201);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body).to.include.keys(
            'id', 'author', 'content', 'title', 'created');
          expect(res.body.name).to.equal(newBlogPost.name);
          // cause Mongo should have created id on insertion
          expect(res.body.id).to.not.be.null;
          expect(res.body.author).to.contain(newBlogPost.author.firstName);
          expect(res.body.author).to.contain(newBlogPost.author.lastName);
          expect(res.body.content).to.equal(newBlogPost.content);
          expect(res.body.title).to.equal(newBlogPost.title);
          console.log(res.body.id);
          return BlogPost.findById(res.body.id);
        })
        .then(function(post) {
          console.log("This is post" + post);
          expect(post.author.firstName).to.equal(newBlogPost.author.firstName);
          expect(post.author.lastName).to.equal(newBlogPost.author.lastName);
          expect(post.content).to.equal(newBlogPost.content);
          expect(post.title).to.equal(newBlogPost.title);
        });
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing blog post from db
    //  2. Make a PUT request to update that blog post
    //  3. Prove the post returned by request contains data we sent
    //  4. Prove the post in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        author: {
	  firstName: 'James',
	  lastName: 'Cooper'
	  },
        content: 'This book is a historical account.',
	title: 'The Last of the Mohicans'
      };

      return BlogPost
        .findOne()
        .then(function(post) {
          updateData.id = post.id;

          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/posts/${post.id}`)
            .send(updateData);
        })
        .then(function(res) {
          expect(res).to.have.status(204);

          return BlogPost.findById(updateData.id);
        })
        .then(function(post) {
          expect(post.author.firstName).to.equal(updateData.author.firstName);
          expect(post.author.lastName).to.equal(updateData.author.lastName);
          expect(post.content).to.equal(updateData.content);
          expect(post.title).to.equal(updateData.title);
        });
    });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a blog post
    //  2. make a DELETE request for that blog post's id
    //  3. assert that response has right status code
    //  4. prove that the post with the id doesn't exist in db anymore
    it('delete the post by id', function() {

      let post;

      return BlogPost
        .findOne()
        .then(function(_post) {
          post = _post;
          return chai.request(app).delete(`/posts/${post.id}`);
        })
        .then(function(res) {
          expect(res).to.have.status(204);
          return BlogPost.findById(post.id);
        })
        .then(function(_post) {
          expect(_post).to.be.null;
        });
    });
  });
});
