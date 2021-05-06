const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid')
var serviceAccount = require("./permissions.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://autofeed2020.firebaseio.com"
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true })

var Twitter = require('twitter');
var config = require('./config.js');
var Tweet = new Twitter(config);
const axios = require('axios');
const cheerio = require("cheerio");
const fs = require("fs");
const json2csv = require("json2csv").Parser;
const htmlToText = require('html-to-text');

const moment = require('moment');

const express = require('express');
const cors = require('cors');
const { endianness } = require('os');
const app = express();

app.use(cors({ origin: true }));

let fecha = parseInt(moment(new Date()).format("x") / 1000);
let fechaClasica = new Date().toISOString()
let News_found = "NO"
let Arraydata = [{
    titulo: "",
    descripcion: "",
    cuerpo: "",
    img: "",
    url: "",
    fecha: fecha,
    fechaClasica: fechaClasica,
    fuente: '',
    tags: '',
    idioma: '',
}];
let tags = []
// Set up your search parameters


async function getAlltags() {
    try {
        let query = await db.collection('usuarios');
        await query.get()
            .then(async function (querySnapshot) {
                let docs = querySnapshot.docs;
                for (let doc of docs) {
                    if (doc.data().tags) {
                        for (let tag of doc.data().tags) {
                            let tempTags = tag.split(";")
                            for (let i = 0; tempTags.length > i; i++) {
                                tags.push(tempTags[i]);
                            }
                        }
                    }
                }
                //console.log(tags)
                twitter()
            });
    } catch (error) {
        console.log(error);
    }
}

async function twitter() {
    for (let j = 0; tags.length > 0;) {
        if (tags[j] && tags[j] !== "Comment gagner un million d'euros") {
            let twitter_tag = tags[j].replace(/'/g, '');
            twitter_tag = encodeURI(tags[j]);
            var params = {
                q: twitter_tag,
                count: 10,
                result_type: 'recent',
                lang: 'en'
            }
           await Tweet.get('search/tweets',params).then(async function (data,err,response) {
               console.log("j "+j)
                if (data.statuses.length > 0) {
                    const batch = db.batch();
                    await getData(data, "twitter", twitter_tag);
                    await Arraydata.forEach(async function (object, i, array) {
                        let tempdate = object.date ? moment(object.date).format() : new Date();
                        let fechaTemp = parseInt(moment(tempdate).format("x") / 1000);
                        let fechaClasicaTemp = new Date(tempdate).toISOString()
                        let unique_id_twitter = object.url ? encodeURIComponent(object.url) : object.id;
                        const Ref = db.collection('noticias').doc('/' + unique_id_twitter + '/')
                        console.log("enter firebase forEach")
                        batch.set(Ref, {
                            id: uuidv4(),
                            titulo: object.title,
                            descripcion: object.description,
                            cuerpo: object.description,
                            img: object.img,
                            url: object.url,
                            fecha: fechaTemp,
                            fechaClasica: fechaClasicaTemp,
                            fuente: 'twitter',
                            tags: object.tag,
                            idioma: 'es',
                        })
                        if (Arraydata.length == i + 1) {
                            j++
                        }
                    })
                    batch.commit().then(async function () {
                        await console.log('Done.')
                    }).catch(err => console.log(`There was an error: ${err}`))
                }else if(err){
                    j++
                }else if(data.statuses.length <= 0){
                    j++
                }

            }).catch(error => {
                j++
            })
        }  else {
            if (tags.length == j) {
                console.log("tags.length  " + j)
                console.log("break  " + j)
                break
            } else {
                console.log("undefined  " + j)
                j++
            }
        }
    }
}

async function getData(data, type, tag) {
    Arraydata = [{
        titulo: "",
        descripcion: "",
        cuerpo: "",
        img: "",
        url: "",
        fecha: fecha,
        fechaClasica: fechaClasica,
        fuente: '',
        tags: '',
        idioma: 'en',
    }];
    if (type == "twitter") {
        if (data.statuses.length > 0) {
            await data.statuses.forEach(async function (object, i, array) {            
                let tags = [];
                tags.push(tag);
                title = "twitter #" + tag;
                description = object.text;
                let checkHashTagsIncludes = object.text.includes("#");
                if(checkHashTagsIncludes){
                    let splitIntoArray = object.text.split(" ");
                    splitIntoArray.forEach(async function(object, i, array){
                        let hashTagsIncludeHash = object.includes("#")
                        if(hashTagsIncludeHash){
                            let removeBlankSpaces = object.trim()
                            let replaceHash = removeBlankSpaces.split("#")[1];
                            replaceHah = replaceHash.replace(/[^a-z\d\s]+/gi, "");;
                            replaceHah = replaceHah.toLowerCase();
                            tags.push(replaceHah)
                        }
                    })
                }
                img = object.entities.media && object.entities.media.length > 0 ? object.entities.media[0].media_url_https : 'https://firebasestorage.googleapis.com/v0/b/autofeed2020.appspot.com/o/img%2Fwhitelogo.png?alt=media&token=e9002688-358a-4997-94b0-31b460635c01';
                url = object.entities.media && object.entities.media.length > 0 ? object.entities.media[0].url : object.entities.url && object.entities.url.length > 0 ? object.entities.url[0].url : "";
                let date = object.created_at;
                await Arraydata.push({
                    title: title,
                    description: description,
                    img: img,
                    url: url,
                    tag: tags,
                    date: date,
                    id: object.id_str,
                    language: "en"
                });
            });
        }
    }
    News_found = Arraydata.length > 1 ? "Yes" : "No";
    Arraydata.length > 1 ? Arraydata.shift() : Arraydata;
}

getAlltags();

exports.app = functions.https.onRequest(app);