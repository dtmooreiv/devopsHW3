var redis = require('redis');
var multer  = require('multer');
var express = require('express');
var http = require('http');
var httpProxy = require('http-proxy');
var fs = require('fs');
var app = express();

var expiringKey = 'expires';
var recentKey = 'recentSites';
var catListKey = 'demKitties';
var proxyListKey = 'targets';

// REDIS
var client = redis.createClient(6379, '127.0.0.1', {});
var serverTarget = 'http://127.0.0.1:3000';
var server2Target = 'http://127.0.0.1:3001';

var TARGET = serverTarget;

//clear the old list
client.del(proxyListKey);
//and push in the new targets
client.lpush(proxyListKey, serverTarget);
client.lpush(proxyListKey, server2Target);

// HTTP SERVER
var server = app.listen(3000, function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)
});

var server2 = app.listen(3001, function () {

  var host = server2.address().address
  var port = server2.address().port

  console.log('Example app listening at http://%s:%s', host, port)
});

var options = {};
var proxy = httpProxy.createProxyServer(options);

var proxyServer = http.createServer(function(req, res)
{
  proxy.web( req, res, {target: TARGET } );
  client.rpoplpush(proxyListKey, proxyListKey, function(err, result) {
    if(err) {
      console.log("rpoplpush failed: " + err);
    } else {
      TARGET = result;
      console.log("Set target to: " + TARGET);
    }
  });
});
proxyServer.listen(8080);

///////////// WEB ROUTES

// Add hook to make it easier to get all visited URLS.
app.use('/',function(req, res, next) 
{
	console.log(req.method, req.url);

	client.lpush(recentKey, req.url);
  client.ltrim(recentKey, 0, 4);

	next(); // Passing the request to the next handler in the stack.
});

app.get('/set', function(req, res) {
  client.set(expiringKey, 'this message will self-destruct in 10 seconds');
  client.expire(expiringKey, 10, function(err, result) {
    if(err) {
        console.log("Setting expire failed: " + err);
    }
  });
  res.send("Key set");
});

app.get('/get', function(req, res) {
    client.get(expiringKey, function(err, result) {
        if(err) {
            res.send('Something went wrong. ' + err);
        } else {
            if(result) {
                res.send('Result is :' +  result);
            } else {
                res.send('Key expired');
            }
        }
    });
});

app.get('/recent', function(req, res) {
    client.lrange(recentKey, 0, 4, function(err, result) {
    if(err) {
        res.send('Something went wrong. ' + err);
    } else {
        if(result) {
            res.send('Result is :' +  result);
        } else {
            res.send('No recently visited sites.');
        }
    }
    });
});


app.post('/upload',[ multer({ dest: './uploads/'}), function(req, res){
   console.log(req.body) // form fields
   console.log(req.files) // form files

   if( req.files.image )
   {
	   fs.readFile( req.files.image.path, function (err, data) {
	  		if (err) throw err;
	  		var img = new Buffer(data).toString('base64');
	  		client.lpush(catListKey, img);
		});
	}
   res.status(204).end()
}]);

app.get('/meow', function(req, res) {
	{
        client.lpop(catListKey, function(err, result) {
            if (err) throw err
            if (result) {
                res.writeHead(200, {'content-type':'text/html'});
                res.write("<h1>\n<img src='data:my_pic.jpg;base64,"+result+"'/>");
                res.end();
            } else {
                res.send("No cat pics brah");
            }

        });
	}
})



