const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const app = express()
app.use(express.json())

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Path: ${e.message}`)
    process.exit(1)
  }
}
initializeDbAndServer()

//API1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const userDetails = await db.get(getUserQuery)
  if (userDetails === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const addUserQuery = `INSERT INTO user (username,name,password,gender) VALUES
             ('${username}','${name}','${hashedPassword}','${gender}');`
      await db.run(addUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const userDetails = await db.get(getUserQuery)
  if (userDetails === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isMatch = await bcrypt.compare(password, userDetails.password)
    if (isMatch) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//API 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const output = await db.get(getUserQuery)
  const getTweetQuery = `SELECT userFollower.username AS username, tweet.tweet AS tweet, tweet.date_time AS dateTime
  FROM (user INNER JOIN follower ON user.user_id = follower.following_user_id) AS userFollower INNER JOIN 
  tweet ON userFollower.user_id = tweet.user_id WHERE follower.follower_user_id=${output.user_id} 
  ORDER BY dateTime DESC limit 4;`
  const getTweet = await db.all(getTweetQuery)
  response.send(getTweet)
})

//API 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const getUser = await db.get(getUserQuery)
  const getUserFollows = `SELECT  name FROM user INNER JOIN follower 
  ON user.user_id = follower.following_user_id WHERE follower.follower_user_id=${getUser.user_id};`
  const result = await db.all(getUserFollows)
  response.send(result)
})

//API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  let {username} = request
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const userDetails = await db.get(getUserQuery)
  const getFollowsUser = `SELECT name FROM user INNER JOIN follower ON user.user_id
  = follower.follower_user_id WHERE follower.following_user_id=${userDetails.user_id};`
  const result = await db.all(getFollowsUser)
  response.send(result)
})

//API 6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  let {username} = request
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const userDetails = await db.get(getUserQuery)
  const getFollowerQuery = `SELECT follower.following_user_id AS user_id FROM follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id WHERE 
  follower.follower_user_id = ${userDetails.user_d} AND tweet.tweet_id=${tweetId};`
  const tweetDetails = await db.get(getFollowerQuery)
  if (tweetDetails === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const getTweetQuery = `SELECT userLike.tweet AS tweet, COUNT(distinct userLike.like_id) AS likes, COUNT(distinct reply.reply_id) AS replies,
    userLike.date_time AS dateTime FROM (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) AS userLike INNER JOIN reply userLike.tweet_id
    =reply.tweet_id WHERE userLike.tweet_id=${tweetId} ORDER BY userLike.tweet_id;`
    const getTweet = await db.all(getTweetQuery)
    response.send(getTweet)
  }
})

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    let {username} = request
    const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
    const userDetails = await db.get(getUserQuery)
    const getFollowerQuery = `SELECT follower.following_user_id AS user_id INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  WHERE follower.follower_user_id=${userDetails.user_id} AND tweet.tweet_id=${tweetId};`
    const getTweet = await db.get(getFollowerQuery)
    if (getTweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getLikeQuery = `SELECT * from like INNER JOIN user ON like.user_id=user.user_id WHERE like.tweet_id = ${tweetId};`
      const getTweet = await db.all(getLikeQuery)
      console.log(getTweet)
      let userArray = []
      let output = getTweet.map(each => {
        userArray.push(each.username)
      })
      response.send({likes: userArray})
    }
  },
)

//API 8
app.get(
  '/tweet/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.param
    const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
    const userDetails = await db.get(getUserQuery)
    const getFollowerQuery = `SELECT follower.following_user_id AS user_id INNER JOIN tweet ON follower.following_user_id = tweet.user_id
  WHERE follower.follower_user_id=${userDetails.user_id} AND tweet.tweet_id=${tweetId};`
    const getTweet = await db.get(getFollowerQuery)
    if (getTweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getReplyQuery = `SELECT user.name, reply FROM reply INNER JOIN user ON reply.user_id=user.user_id WHERE reply.tweet_id=${tweetId};`
      const getTweet = await db.all(getReplyQuery)
      let outputArray = []
      const likeObject = getTweet.map(each => {
        outputArray.push({name: each.name, reply: each.reply})
      })
      response.send({replies: outputArray})
    }
  },
)

//API 9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const userDetails = await db.get(getUserQuery)
  const getTweetQuery = `SELECT userLike.tweet AS tweet, COUNT(distinct userLike.like_id) AS likes, COUNT(distinct reply.reply_id) AS replies,
    userLike.date_time AS dateTime FROM (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) AS userLike INNER JOIN reply userLike.tweet_id
    =reply.tweet_id WHERE userLike.user_id=${userDetails.user_id} ORDER BY userLike.tweet_id;`
  const tweets = await db.all(getTweetQuery)
  response.send(tweets)
})

//API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  let {username} = request
  const {tweet} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
  const userDetails = await db.get(getUserQuery)
  const getTweetQuery = `INSERT INTO tweet (tweet, user_id) VALUES ('${tweet}',${userDetails.user_id})`
  const getTweet = await db.run(getTweetQuery)
  response.send('Created a Tweet')
})

//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserQuery = `SELECT * FROM user WHERE username='${username}';`
    const userDetails = await db.get(getUserQuery)
    const getTweet = `SELECT * FROM user INNER JOIN tweet ON user.user_id = tweet.user_id WHERE tweet.tweet_id=${tweetId} AND user.user_id=
  ${userDetails.user_id};`
    const tweetDetails = await db.get(getTweet)
    if (tweetDetails === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
