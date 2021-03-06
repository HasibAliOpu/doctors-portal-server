const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pvs3o.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized Access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.USER_TOKEN, function (err, decoded) {
    if (err) {
      res.status(403).send({ message: "Forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
};
async function run() {
  try {
    ///     All Collections     ///

    await client.connect();
    const servicesCollection = client
      .db("Doctors-Portal")
      .collection("services");
    const bookingsCollection = client
      .db("Doctors-Portal")
      .collection("bookings");
    const usersCollection = client.db("Doctors-Portal").collection("users");
    const doctorsCollection = client.db("Doctors-Portal").collection("doctors");
    const paymentsCollection = client
      .db("Doctors-Portal")
      .collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requestAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requestAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "Forbidden Access" });
      }
    };

    /********** All GET APIs  ******/

    // Get all treatment
    app.get("/service", async (req, res) => {
      const services = await servicesCollection
        .find()
        .project({ name: 1 })
        .toArray();

      res.send(services);
    });

    // Get all users

    app.get("/users", verifyJWT, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
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

    app.get("/booking", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded?.email;
      if (patient === decodedEmail) {
        const bookings = await bookingsCollection
          .find({ patient: patient })
          .toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden Access" });
      }
    });

    // Get api for specific booking

    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const booking = await bookingsCollection.findOne({ _id: ObjectId(id) });

      res.send(booking);
    });

    // GET api for filtering admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // GET API for all doctor info

    app.get("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctors = await doctorsCollection.find().toArray();
      res.send(doctors);
    });

    /********   ALL POST/PATCH APIs **********/

    app.patch("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const result = await paymentsCollection.insertOne(payment);
      const updatedBooking = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(updatedDoc);
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

    // POST API for payment getway

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // POST API for insert the doctor

    app.post("/doctor", verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    app.delete("/doctor/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      const result = await doctorsCollection.deleteOne({ email: email });
      res.send(result);
    });

    /********* ALL PUT APIs *******/

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
      const token = jwt.sign({ email: email }, process.env.USER_TOKEN, {
        expiresIn: "2h",
      });
      res.send({ result, token });
    });

    // PUT api for make admin
    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
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
