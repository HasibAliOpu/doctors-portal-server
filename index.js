const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
const { get } = require("express/lib/response");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pvs3o.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
async function run() {
  try {
    await client.connect();
    const servicesCollection = client
      .db("Doctors-Portal")
      .collection("services");
    const bookingsCollection = client
      .db("Doctors-Portal")
      .collection("bookings");
    const usersCollection = client.db("Doctors-Portal").collection("users");

    // Get all treatment
    app.get("/service", async (req, res) => {
      const cursor = servicesCollection.find();
      const services = await cursor.toArray();
      res.send(services);
    });

    // GET api for available treatment
    app.get("/available", async (req, res) => {
      const date = req.query.date;
      const services = await servicesCollection.find().toArray();
      const query = { date: date };
      const bookings = await bookingsCollection.find(query).toArray();
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        const bookedSlots = serviceBookings.map((book) => book.slot);
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        service.slots = available;
      });
      res.send(services);
    });

    // GET api for booking collection
    app.get("/booking", async (req, res) => {
      const patient = req.query.patient;

      const bookings = await bookingsCollection
        .find({ patient: patient })
        .toArray();
      res.send(bookings);
    });

    // POST api for booked the treatment
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingsCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, exists });
      }
      await bookingsCollection.insertOne(booking);
      res.send({ success: true });
    });

    // PUT api for user collection
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
  } catch (error) {
    console.log(error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Doctor uncle!");
});

app.listen(port, () => {
  console.log(`Doctors app listening on port ${port}`);
});
