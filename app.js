const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const dbPath = path.join(__dirname, 'twitterClone.db')
const app = express()
app.use(express.json())
let db = null
const initializeDbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('server Running....')
    })
  } catch (e) {
    console.log(`DB error ${e.message}`)
    process.exit(1)
  }
}
initializeDbServer()

//register API
app.post('/register/', async (request, response) => {
  const {username, name, password, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const userQuery = `
  SELECT * FROM user WHERE username='${username}';
  `
  const dbUser = await db.get(userQuery)
  if (dbUser === undefined) {
    //create new user
    const newUser = `
    INSERT INTO user (username,name,password,gender)
    VALUES ('${username}','${name}','${hashedPassword}','${gender}');
    `
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const addNewUser = await db.run(newUser)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    //user already exists
    response.status(400)
    response.send('User already exists')
  }
})

//login API

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUser = `SELECT * FROM user WHERE username='${username}';`
  const gettingNewUser = await db.get(getUser)
  if (gettingNewUser === undefined) {
    //invalid user login
    response.status(400)
    response.send('Invalid user')
  } else {
    //check password and compare
    const isPasswordSame = await bcrypt.compare(
      password,
      gettingNewUser.password,
    )
    if (isPasswordSame === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'Jyo')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'Jyo', async (error, payload) => {
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

const getFollowingPeopleIdsOfUser = async username => {
  const getFollowingPeopleQuery = `
    SELECT following_user_id FROM follower
    INNER JOIN user ON user.user_id=follower.follower_user_id
    WHERE user.username='${username}';
    `
  const following_people = await db.all(getFollowingPeopleQuery)
  const arrayOfIds = following_people.map(
    eachPerson => eachPerson.following_user_id,
  )
  return arrayOfIds
}

// API 3 /user/tweets/feed/
app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  //get followers Id query
  const getFollowersIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id='${getUserId.user_id}';`
  const getFollowerIds = await db.all(getFollowersIdQuery)

  const getFollowerIdsAll = getFollowerIds.map(eachUser => {
    return eachUser.following_user_id
  })

  const getTweetQuery = `
  SELECT user.username,tweet.tweet,tweet.date_time AS dateTime
  FROM user INNER JOIN tweet ON user.user_id=tweet.user_id
  WHERE user.user_id IN (${getFollowerIdsAll})
  ORDER BY tweet.date_time DESC
  LIMIT 4;
  `
  const tweets = await db.all(getTweetQuery)
  response.send(tweets)
})

// API 4 /user/following/
app.get('/user/following/', authentication, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  //get followers Id query
  const getFollowersIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id='${getUserId.user_id}';`
  const getFollowerIdsArray = await db.all(getFollowersIdQuery)
  //console.log(getFollowerIdsArray);
  const getFollowerIdsAll = getFollowerIdsArray.map(eachUser => {
    return eachUser.following_user_id
  })
  //console.log(getFollowerIdsAll);
  const userFollowingQuery = `SELECT name FROM user WHERE user_id IN (${getFollowerIdsAll});`
  const userFollowingPeople = await db.all(userFollowingQuery)
  response.send(userFollowingPeople)
  //console.log(userFollowingPeople);
})

// API 5 /user/followers/
app.get('/user/followers/', authentication, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  //get followers Id query
  const getFollowersIdQuery = `SELECT follower_user_id FROM follower WHERE following_user_id='${getUserId.user_id}';`
  const getFollowerIdsArray = await db.all(getFollowersIdQuery)
  //console.log(getFollowerIdsArray);
  const getFollowerIdsAll = getFollowerIdsArray.map(eachUser => {
    return eachUser.follower_user_id
  })
  //console.log(getFollowerIdsAll);
  const userFollowerQuery = `SELECT name FROM user WHERE user_id IN (${getFollowerIdsAll});`
  const userFollowerPeople = await db.all(userFollowerQuery)
  response.send(userFollowerPeople)
})

//API 6 object conversion
const apiSixConversion = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: replyCount.likes,
    replies: likesCount.replies,
    dateTime: tweetData.date_time,
  }
}

// API 6 /tweets/:tweetId/

app.get('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  //get followers Id query
  const getFollowersIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id='${getUserId.user_id}';`
  const getFollowerIdsArray = await db.all(getFollowersIdQuery)
  //console.log(getFollowerIdsArray);
  const getFollowerIdsAll = getFollowerIdsArray.map(eachUser => {
    return eachUser.following_user_id
  })
  const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowerIdsAll});`
  const getTweetIdsArray = await db.all(getTweetIdsQuery)
  //console.log(getTweetIdsArray);
  const followingTweetIds = getTweetIdsArray.map(eachId => {
    return eachId.tweet_id
  })
  //console.log(followingTweetIds);
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likesCountQuery = `select count(user_id) as likes from like where tweet_id=${tweetId};`
    const likesCount = await db.get(likesCountQuery)
    //console.log(likesCount);
    const replyCountQuery = `select count(user_id) as replies from reply where tweet_id=${tweetId};`
    const replyCount = await db.get(replyCountQuery)
    //console.log(replyCount);
    const tweetDateTimeQuery = `select tweet,date_time from tweet where tweet_id=${tweetId};`
    const tweetDateTime = await db.get(tweetDateTimeQuery)
    //console.log(tweetDateTime);
    response.send(apiSixConversion(tweetDateTime, replyCount, likesCount))
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API sevenConversion
const apiSevenConversion = userLikes => {
  return {
    likes: userLikes,
  }
}

// API 7 /tweets/:tweetId/likes/

app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)
    //get followers Id query
    const getFollowersIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id='${getUserId.user_id}';`
    const getFollowerIdsArray = await db.all(getFollowersIdQuery)
    //console.log(getFollowerIdsArray);
    const getFollowerIdsAll = getFollowerIdsArray.map(eachUser => {
      return eachUser.following_user_id
    })
    //console.log(getFollowerIdsAll);
    const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowerIdsAll});`
    const getTweetIdsArray = await db.all(getTweetIdsQuery)
    //console.log(getTweetIdsArray);
    const getTweetIds = getTweetIdsArray.map(eachId => {
      return eachId.tweet_id
    })
    //console.log(followingTweetIds);
    if (getTweetIds.includes(parseInt(tweetId))) {
      const likesUsernameQuery = `SELECT user.username as likes FROM user INNER JOIN like ON user.user_id=like.user_id
        WHERE like.tweet_id=${tweetId};
        `
      const likesUsername = await db.all(likesUsernameQuery)
      const getUserLikesNames = likesUsername.map(each => {
        return each.likes
      })
      //console.log(getUserLikesNames);
      response.send(apiSevenConversion(getUserLikesNames))
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 8 ObjectConversion

const conversionToObjectEightApi = dbObject => {
  return {
    replies: dbObject,
  }
}

//API 8  /tweets/:tweetId/replies/

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)
    //get followers Id query
    const getFollowersIdQuery = `SELECT following_user_id FROM follower WHERE follower_user_id='${getUserId.user_id}';`
    const getFollowerIdsArray = await db.all(getFollowersIdQuery)
    //console.log(getFollowerIdsArray);
    const getFollowerIdsAll = getFollowerIdsArray.map(eachUser => {
      return eachUser.following_user_id
    })
    //console.log(getFollowerIdsAll);
    const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowerIdsAll});`
    const getTweetIdsArray = await db.all(getTweetIdsQuery)
    //console.log(getTweetIdsArray);
    const getTweetIds = getTweetIdsArray.map(eachId => {
      return eachId.tweet_id
    })
    console.log(getTweetIds)
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getUserNameReplyQuery = `
        SELECT user.name,reply.reply from user inner join reply on user.user_id=reply.user_id
        where reply.tweet_id=${tweetId};
        `
      const userNameReply = await db.all(getUserNameReplyQuery)
      //console.log(userNameReply);
      response.send(conversionToObjectEightApi(userNameReply))
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 9 /user/tweets/

app.get('/user/tweets/', authentication, async (request, response) => {
  const {userId} = request
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const getTweetsQuery = `
    SELECT tweet,
    COUNT(DISTINCT like_id) AS likes,
    COUNT(DISTINCT reply_id) AS replies,
    date_time AS dateTime
    FROM tweet LEFT JOIN reply ON
    tweet.tweet_id=reply.tweet_id
    LEFT JOIN like ON tweet.tweet_id=like.tweet_id
    where tweet.user_id=${getUserId.user_id}
    GROUP BY tweet.tweet_id;
    `
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

//API 10

app.post('/user/tweets/', authentication, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  const {tweet} = request.body
  const currentDate = new Date()
  const postRequestQuery = `insert into tweet(tweet,user_id,date_time) values('${tweet}',${
    getUserId.user_id + 11
  },'${currentDate}');`
  const responseResult = await db.run(postRequestQuery)
  const tweetIdd = responseResult.lastID
  console.log(tweetIdd)
  response.send('Created a Tweet')
})

//API 11
app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)
  //console.log(getUserId);
  const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`
  const getUserTweetsListArray = await db.all(getUserTweetsListQuery)
  const getTweetUserList = getUserTweetsListArray.map(eachTweet => {
    return eachTweet.tweet_id
  })
  //console.log(getTweetUserList);
  if (getTweetUserList.includes(parseInt(tweetId))) {
    const deleteQuery = `delete from tweet where tweet_id=${tweetId};`
    const deleteQueryArray = await db.run(deleteQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
