/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const WIN_Z = 0;  // default graphics window z coord in world space
const WIN_LEFT = 0; const WIN_RIGHT = 1;  // default left and right x coords in world space
const WIN_BOTTOM = 0; const WIN_TOP = 1;  // default top and bottom y coords in world space
const INPUT_TRIANGLES_URL = "https://ncsucgclass.github.io/prog2/triangles.json"; // triangles file loc
const INPUT_SPHERES_URL = "https://ncsucgclass.github.io/prog2/spheres.json"; // spheres file loc
var Eye = new vec4.fromValues(0.5,0.5,-0.5,1.0); // default eye position in world space

/* webgl globals */
var gl = null; // the all powerful gl object. It's all here folks!
var vertexBuffer; // this contains vertex coordinates in triples
var triangleBuffer; // this contains indices into vertexBuffer in triples
var triBufferSize; // the number of indices in the triangle buffer
var vertexPositionAttrib; // where to put position for vertex shader
var colorBuffer; // this contains vertex colors in triples
var vertexColorAttrib; // where to put color for vertex shader

/* model globals */
var inputTriangles; // triangle sets read from the input file
var catTriangles; // triangle sets making up the cat face
var showCat = false; // whether the cat face is displayed instead of the input triangles


// ASSIGNMENT HELPER FUNCTIONS

// get the JSON file from the passed URL
function getJSONFile(url,descr) {
    try {
        if ((typeof(url) !== "string") || (typeof(descr) !== "string"))
            throw "getJSONFile: parameter not a string";
        else {
            var httpReq = new XMLHttpRequest(); // a new http request
            httpReq.open("GET",url,false); // init the request
            httpReq.send(null); // send the request
            var startTime = Date.now();
            while ((httpReq.status !== 200) && (httpReq.readyState !== XMLHttpRequest.DONE)) {
                if ((Date.now()-startTime) > 3000)
                    break;
            } // until its loaded or we time out after three seconds
            if ((httpReq.status !== 200) || (httpReq.readyState !== XMLHttpRequest.DONE))
                throw "Unable to open "+descr+" file!";
            else
                return JSON.parse(httpReq.response); 
        } // end if good params
    } // end try    
    
    catch(e) {
        console.log(e);
        return(String.null);
    }
} // end get input spheres

// set up the webGL environment
function setupWebGL() {

    // Get the canvas and context
    var canvas = document.getElementById("myWebGLCanvas"); // create a js canvas
    gl = canvas.getContext("webgl"); // get a webgl object from it
    
    try {
      if (gl == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
        gl.clearDepth(1.0); // use max when we clear the depth buffer
        gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
      }
    } // end try
    
    catch(e) {
      console.log(e);
    } // end catch
 
} // end setupWebGL

// load the passed triangle sets into webgl buffers, replacing any previously loaded ones
function loadTriangles(inputTriangles) {
    if (inputTriangles != String.null) {
        if (vertexBuffer) { // free the buffers of the previously loaded model
            gl.deleteBuffer(vertexBuffer);
            gl.deleteBuffer(colorBuffer);
            gl.deleteBuffer(triangleBuffer);
        }

        var whichSetVert; // index of vertex in current triangle set
        var whichSetTri; // index of triangle in current triangle set
        var coordArray = []; // 1D array of vertex coords for WebGL
        var indexArray = []; // 1D array of vertex indices for WebGL
        var colorArray = []; // 1D array of vertex colors for WebGL
        var vtxBufferSize = 0; // the number of vertices in the vertex buffer so far

        for (var whichSet=0; whichSet<inputTriangles.length; whichSet++) {

            // set up the vertex coord and color arrays, each vertex gets its set's diffuse color
            for (whichSetVert=0; whichSetVert<inputTriangles[whichSet].vertices.length; whichSetVert++){
                coordArray = coordArray.concat(inputTriangles[whichSet].vertices[whichSetVert]);
                colorArray = colorArray.concat(inputTriangles[whichSet].material.diffuse);
                // console.log(inputTriangles[whichSet].vertices[whichSetVert]);
            }

            // set up the triangle index array, offsetting set indices into the shared vertex buffer
            for (whichSetTri=0; whichSetTri<inputTriangles[whichSet].triangles.length; whichSetTri++) {
                var tri = inputTriangles[whichSet].triangles[whichSetTri];
                indexArray.push(tri[0]+vtxBufferSize, tri[1]+vtxBufferSize, tri[2]+vtxBufferSize);
            }

            vtxBufferSize += inputTriangles[whichSet].vertices.length; // later sets start after this one
        } // end for each triangle set
        triBufferSize = indexArray.length; // number of indices to draw
        // console.log(coordArray.length);
        // send the vertex coords to webGL
        vertexBuffer = gl.createBuffer(); // init empty vertex coord buffer
        gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate that buffer
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(coordArray),gl.STATIC_DRAW); // coords to that buffer

        // send the vertex colors to webGL
        colorBuffer = gl.createBuffer(); // init empty vertex color buffer
        gl.bindBuffer(gl.ARRAY_BUFFER,colorBuffer); // activate that buffer
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(colorArray),gl.STATIC_DRAW); // colors to that buffer

        // send the triangle indices to webGL
        triangleBuffer = gl.createBuffer(); // init empty triangle index buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffer); // activate that buffer
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indexArray),gl.STATIC_DRAW); // indices to that buffer

    } // end if triangles found
} // end load triangles

// CAT FACE: triangle sets in the same format as the input file, in webgl's default view
// smaller z is closer to the eye, so features use smaller z than the head they sit on

// make a triangle set of one color from vertices and triangles
function makeSet(color,vertices,triangles) {
    return {material: {diffuse: color}, vertices: vertices, triangles: triangles};
} // end make set

// make an ellipse as a triangle fan around its center
function makeEllipse(cx,cy,rx,ry,z,color) {
    var segments = 32; // number of triangles around the rim
    var vertices = [[cx,cy,z]];
    var triangles = [];
    for (var s=0; s<segments; s++) {
        var angle = 2*Math.PI*s/segments;
        vertices.push([cx+rx*Math.cos(angle), cy+ry*Math.sin(angle), z]);
        triangles.push([0, s+1, (s+1)%segments+1]);
    }
    return makeSet(color,vertices,triangles);
} // end make ellipse

// make a single triangle from three xy points
function makeTriangle(p0,p1,p2,z,color) {
    return makeSet(color,[[p0[0],p0[1],z],[p1[0],p1[1],z],[p2[0],p2[1],z]],[[0,1,2]]);
} // end make triangle

// make a line of the passed width as a thin quad
function makeLine(x0,y0,x1,y1,width,z,color) {
    var len = Math.hypot(x1-x0, y1-y0);
    var nx = -(y1-y0)/len*width/2, ny = (x1-x0)/len*width/2; // half-width perpendicular offset
    return makeSet(color,
        [[x0+nx,y0+ny,z],[x1+nx,y1+ny,z],[x1-nx,y1-ny,z],[x0-nx,y0-ny,z]],
        [[0,1,2],[2,3,0]]);
} // end make line

// build the triangle sets for a grey tabby cat face
function makeCatFace() {
    var fur = [0.55,0.55,0.57], stripe = [0.3,0.3,0.32], light = [0.85,0.85,0.85];
    var earPink = [0.9,0.65,0.7], nosePink = [0.9,0.55,0.6];
    var eyeGreen = [0.55,0.72,0.25], dark = [0.12,0.12,0.12], white = [0.97,0.97,0.97];
    var sets = [];

    for (var side=-1; side<=1; side+=2) { // mirrored features, left then right
        // ears, behind the head so it covers their bases
        sets.push(makeTriangle([0.7*side,0.15],[0.55*side,0.88],[0.2*side,0.45],0.6,fur));
        sets.push(makeTriangle([0.6*side,0.28],[0.52*side,0.75],[0.3*side,0.47],0.55,earPink));

        // tabby stripes: forehead "M", cheeks, and lines from the outer eye corners
        sets.push(makeTriangle([0.22*side,0.47],[0.13*side,0.49],[0.12*side,0.27],0.4,stripe));
        sets.push(makeTriangle([0.38*side,0.41],[0.30*side,0.44],[0.24*side,0.28],0.4,stripe));
        sets.push(makeTriangle([0.76*side,-0.15],[0.76*side,-0.22],[0.5*side,-0.2],0.4,stripe));
        sets.push(makeTriangle([0.72*side,-0.32],[0.70*side,-0.39],[0.5*side,-0.33],0.4,stripe));
        sets.push(makeLine(0.42*side,-0.02,0.66*side,0.06,0.03,0.4,stripe));

        // eyes: dark rim, green iris, slit pupil, highlight
        sets.push(makeEllipse(0.28*side,0.02,0.155,0.12,0.35,dark));
        sets.push(makeEllipse(0.28*side,0.02,0.14,0.105,0.3,eyeGreen));
        sets.push(makeEllipse(0.28*side,0.02,0.035,0.095,0.2,dark));
        sets.push(makeEllipse(0.28*side+0.04,0.06,0.022,0.022,0.1,white));

        // muzzle
        sets.push(makeEllipse(0.1*side,-0.33,0.14,0.1,0.3,light));

        // mouth corner
        sets.push(makeLine(0,-0.33,0.08*side,-0.38,0.015,0.15,dark));

        // whiskers
        sets.push(makeLine(0.2*side,-0.3,0.85*side,-0.2,0.008,0.1,white));
        sets.push(makeLine(0.2*side,-0.33,0.87*side,-0.33,0.008,0.1,white));
        sets.push(makeLine(0.2*side,-0.36,0.83*side,-0.46,0.008,0.1,white));
    } // end for each side

    // head: rounded top plus wider cheeks
    sets.push(makeEllipse(0,-0.1,0.72,0.62,0.5,fur));
    sets.push(makeEllipse(0,-0.25,0.78,0.45,0.5,fur));

    // center forehead stripe, chin, nose and mouth
    sets.push(makeTriangle([-0.045,0.5],[0.045,0.5],[0,0.24],0.4,stripe));
    sets.push(makeEllipse(0,-0.48,0.12,0.07,0.3,light));
    sets.push(makeTriangle([-0.07,-0.18],[0.07,-0.18],[0,-0.26],0.15,nosePink));
    sets.push(makeLine(0,-0.26,0,-0.33,0.015,0.15,dark));

    return sets;
} // end make cat face

// toggle between the input triangles and the cat face when space is pressed
function handleKeyDown(event) {
    if (event.code === "Space") {
        event.preventDefault(); // don't scroll the page
        showCat = !showCat;
        loadTriangles(showCat ? catTriangles : inputTriangles);
        renderTriangles();
    }
} // end handle key down

// setup the webGL shaders
function setupShaders() {
    
    // define fragment shader in essl using es6 template strings
    var fShaderCode = `
        precision mediump float; // fragment shaders need a default float precision
        varying vec3 fragColor; // color interpolated from the vertex shader

        void main(void) {
            gl_FragColor = vec4(fragColor, 1.0); // use the interpolated vertex color
        }
    `;

    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 vertexPosition;
        attribute vec3 vertexColor;
        varying vec3 fragColor; // color passed on to the fragment shader

        void main(void) {
            gl_Position = vec4(vertexPosition, 1.0); // use the untransformed position
            fragColor = vertexColor; // pass the vertex color through
        }
    `;
    
    try {
        // console.log("fragment shader: "+fShaderCode);
        var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        // console.log("vertex shader: "+vShaderCode);
        var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
            gl.deleteShader(vShader);
        } else { // no compile errors
            var shaderProgram = gl.createProgram(); // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                gl.useProgram(shaderProgram); // activate shader program (frag and vert)
                vertexPositionAttrib = // get pointer to vertex shader input
                    gl.getAttribLocation(shaderProgram, "vertexPosition"); 
                gl.enableVertexAttribArray(vertexPositionAttrib); // input to shader from array
                vertexColorAttrib = // get pointer to vertex shader color input
                    gl.getAttribLocation(shaderProgram, "vertexColor");
                gl.enableVertexAttribArray(vertexColorAttrib); // input to shader from array
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders

// render the loaded model
function renderTriangles() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers
    
    // vertex buffer: activate and feed into vertex shader
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate
    gl.vertexAttribPointer(vertexPositionAttrib,3,gl.FLOAT,false,0,0); // feed

    // color buffer: activate and feed into vertex shader
    gl.bindBuffer(gl.ARRAY_BUFFER,colorBuffer); // activate
    gl.vertexAttribPointer(vertexColorAttrib,3,gl.FLOAT,false,0,0); // feed

    // triangle buffer: activate and render
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffer); // activate
    gl.drawElements(gl.TRIANGLES,triBufferSize,gl.UNSIGNED_SHORT,0); // render
} // end render triangles


/* MAIN -- HERE is where execution begins after window load */

function main() {
  
  setupWebGL(); // set up the webGL environment
  inputTriangles = getJSONFile(INPUT_TRIANGLES_URL,"triangles"); // read in the tri file
  catTriangles = makeCatFace(); // build the cat face for the space bar
  loadTriangles(inputTriangles); // load in the triangles from tri file
  document.addEventListener("keydown",handleKeyDown); // space toggles the cat face
  setupShaders(); // setup the webGL shaders
  renderTriangles(); // draw the triangles using webGL
  
} // end main
