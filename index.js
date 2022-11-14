import express from 'express'
import cors from 'cors'
import { MongoClient } from "mongodb"
import dotenv from "dotenv"
import joi from 'joi'
import dayjs from 'dayjs'

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())


const mongoClient = new MongoClient(process.env.MONGO_URI)
let db

try {
    await mongoClient.connect();
    db = mongoClient.db("batepapobd")
} catch (err){
    console.log(err)
}

const userSchema = joi.object({
    name: joi.string().required()
});

app.post("/participants", async (req, res) => {
    const { name } = req.body

    const validation = userSchema.validate({name: name}, { abortEarly: false})

    if(validation.error){
        let errors = validation.error.details.map((detail) => detail.message)
        return res.status(422).send(errors)
    }

    try {

        const user = await db.collection("participants").findOne({
            name: name
        })
        
        if(user){
            return res.status(409).send("Esse usuário já existe")
        } 
        
        await db.collection("participants").insertOne({name: name, lastStatus: Date.now()})

        await db.collection("messages").insertOne({from: name, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs().format("HH:mm:ss")})

        res.sendStatus(201)

    } catch (error) {
        console.log(error)   
    }

})

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray()

        res.send(participants)
    } catch (error) {
        console.log(error)
    }
})

const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.any().valid("message", "private_message")
})

app.post("/messages", async (req, res) => {
    const {to, text, type} = req.body
    const user = req.headers.user

    const validation = messageSchema.validate(req.body, {abortEarly: false})

    if(validation.error){
        const errors = validation.error.details.map((detail) => detail.message)

        return res.status(422).send(errors)
    }

    try {

        const userFrom = await db.collection("participants").findOne({name: user})

        if(!userFrom){
            return res.status(422).send("Usuário remetente não existe")
        }

        await db.collection("messages").insertOne({from: user, to: to, text: text, type: type, time: dayjs().format("HH:mm:ss")})

        res.sendStatus(201)
    } catch (error) {
        console.log(error)
    }
})

app.get("/messages", async (req, res) => {
    const limit = req.query.limit
    const user = req.headers.user

    try {

        let messages = await db.collection("messages").find({ $or: [ { from: user } , { to: user } , {type : "message"} ] }).toArray()

        if(limit){
            messages = messages.slice(-limit)
        }

        res.send(messages.reverse())
    } catch (error) {
        console.log(error)
    }
    
})

app.post("/status", async (req, res) => {
    const user = req.headers.user

    try {
        const participant = await db.collection("participants").findOne({ name: user})

        if(!participant){
            return res.sendStatus(404)
        }

        await db.collection("participants").updateOne({ 
			_id: participant._id 
		}, { $set: {lastStatus: Date.now()} })

        res.sendStatus(200)

    } catch (error) {
        console.log(error)
    }
})

setInterval(removeUsers, 15000)

async function removeUsers(){
    try {
        const users = await db.collection("participants").find({lastStatus: { $lt : Date.now() - 10}}).toArray()

        await db.collection("participants").deleteMany({lastStatus: { $lt : Date.now() - 10000}})

        users.forEach( async (user) => {
            console.log(user)
            
            await db.collection("messages").insertOne({from: user.name, to: 'Todos', text: 'sai da sala...', type: 'status', time: dayjs().format("HH:mm:ss")})
        });
        
    } catch (error) {
        console.log(error)
    }
}

app.listen(5000, console.log("Running in port 5000"))