/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	/* @TODO here
	 *  - Create an historique with "How this is build, to recreate it"
	 *    - el can have reference to all other element related to it point <-> el for easier update
	 *  - Allow set callback to specific action (instance || point onDrag, ..)
	 */

	let Utils = __webpack_require__(1)
	let Cartesian = __webpack_require__(2)
	let Points = __webpack_require__(3)
	let Paths = __webpack_require__(4)

	__webpack_require__(5);

	let UNACTIVATED_NEAR_DISTANCE = 5 //px  | Don't disallow the Event handler, just reduce to resonable size
	let NEAR_DISTANCE = 25 //px

	let UNACTIVATED_MAGNET_DISTANCE = 5 //px  | Don't disallow the Magnet handler, just reduce to resonable size (alway get the 'reference(s) element(s)' when click near an element to stick on it)
	let MAGNET_DISTANCE = 15 //px

	let loadSmarthy = (function(window) {
	  function define_Marthy() {
	    // Define object
	    let Smarthy = function(main, opts) {

	      // If no smarthy exist, create a div on the end of the body
	      if (!main) {
	        main = document.getElementsByTagName("BODY")[0].appendChild(document.createElement('div'))
	      }

	      // Initiale instance object
	      let instance = createInstance(this, main, opts || {})

	      // Load listerners
	      loadInstanceListeners(instance)
	    }
	    // Prototypes
	    loadPublicPrototypes(Smarthy)
	    // Return
	    return Smarthy
	  }

	  // Define globally if it doesn't already exist
	  if(typeof(Smarthy) === 'undefined') {
	    window.Smarthy = define_Marthy()
	  }
	})

	let createInstance = function(instance, main, opts) {
	  // Opts
	  instance._theme = (opts.theme ? opts.theme : 'light')
	  instance._near = {
	    _active: opts.near ? !!opts.near.active : true,
	    _distance: opts.near && opts.near.distance || NEAR_DISTANCE
	  }
	  instance._magnet = {
	    _active: opts.magnet ? !!opts.magnet.active : true,
	    _distance: opts.magnet && opts.magnet.distance || NEAR_DISTANCE
	  }
	  instance._events_active = {
	    _drag: ((opts.events && typeof opts.events.drag !== 'undefined') ? opts.events.drag : true),
	    _scale: ((opts.events && typeof opts.events.scale !== 'undefined') ? opts.events.scale : true),
	    _edit: ((opts.events && typeof opts.events.edit !== 'undefined') ? opts.events.edit : true),
	  }

	  // Handle main
	  main.classList.add('smarthy')
	  // Create SVG
	  let svg_classes = 'smarthy-svg ' + instance._theme
	  if (instance._events_active._edit) {
	    svg_classes += " editable"
	  }
	  let svg = Utils.createTagSVG('svg', {class: svg_classes})
	  main.appendChild(svg)
	  let svgSize = svg.getBoundingClientRect()
	  let points = Utils.createTagSVG('g', {class: 'smarthy-points'})
	  svg.appendChild(points)

	  // Keep the dom
	  instance._dom = {
	    _main: main,
	    _svg: svg,
	    _points: points,
	  },
	  instance._svgSize = svgSize,

	  // Prob not the best thing to pass the `instance` here.. :/
	  instance._cartesian = Cartesian.create(instance, opts && opts.cartesian || {})

	  // // Create cursor point (SHOULD BE ON UI ? )
	  // let cursor = Utils.createTagSVG('circle', {class: 'cursor', cx: 0, cy: 0, r: '4'})
	  // svg.appendChild(cursor)

	  // Create required vars for this instance
	  instance._els_idx = 0 // Keep idx for new id
	  instance._els = [] // Existing elements
	  // instance._cursor = cursor

	  // instance._tool = 'hand'
	  instance._nearest = null // Current `el` nearest of the cursor
	  instance._selected = null // Current `el` selected
	  // instance._drawing = null // Current element during the creation

	  // Data for simple event loaded on the core (cartesian pos or scale update)
	  instance._event = {}

	  // Create init elements
	  if (opts.els) {
	    opts.els.forEach(el_opts => {
	      if (el_opts.type === 'point') {
	        return instance.Points_addPoint(el_opts)
	      }
	      if (el_opts.type === 'path') {
	        return instance.Paths_addPath(el_opts)
	      }
	    })
	  }
	  return instance
	}

	let loadInstanceListeners = function(instance) {

	  instance._dom._svg.onmousedown = function(e) {
	    let mouse_pos = instance.Cartesian_getPositionFromScreen({ x: e.offsetX, y: e.offsetY })
	    handleNearest(instance, mouse_pos)

	    let is_nearest_editable_point = (instance._nearest && (instance._nearest._type === 'point') && (instance._nearest._editable === true))

	    instance._event._is_clicked = true
	    instance._event._is_drag = false // Not a drag until we have 5px diff between first and last
	    instance._event._el = is_nearest_editable_point ? instance._nearest : null
	    instance._event._first_pos = { x: e.offsetX, y: e.offsetY }
	    instance._event._last_pos = { x: e.offsetX, y: e.offsetY }
	  }

	  // Mouse move: Compute .near && .nearest elements
	  instance._dom._svg.onmousemove = function(e) {
	    // Compute Mouse position
	    let mouse_pos = instance.Cartesian_getPositionFromScreen({ x: e.offsetX, y: e.offsetY })
	    handleNearest(instance, mouse_pos)

	    // If an click event is keeped
	    if (instance._event._is_clicked) {
	      // Drag&Drop available ? check `drag` for SVG drag, and `edit` for Point position update
	      let is_drag_available = instance._event._el ? instance._events_active._edit : instance._events_active._drag

	      if (is_drag_available) {
	        // It's not already a drag event
	        if (!instance._event._is_drag) {
	          // Move than 5px on X or Y => is't a drag
	          if ( Math.abs(instance._event._first_pos.x - e.offsetX) > 5 || Math.abs(instance._event._first_pos.y - e.offsetY) > 5) {
	            instance._event._is_drag = true
	            instance._dom._svg.classList.add('drag')
	          }
	        }
	        // If it's a drag
	        if (instance._event._is_drag) {
	          // Drag an element
	          if (instance._event._el) {
	            let magnet_pos = getMagnetPosition(instance, mouse_pos)

	            instance._event._el.setPosition(magnet_pos || mouse_pos) // Exaclty under the mouse
	          }
	          else {
	            // Calculate difference (in mesure NOT pixel)
	            let delta = {
	              x: (e.offsetX - instance._event._last_pos.x) / instance._cartesian._scale._value,
	              y: - (e.offsetY - instance._event._last_pos.y) / instance._cartesian._scale._value
	            }
	            // Update Cartesian position
	            instance.Cartesian_translate(delta)
	          }

	          // Update to keep this position
	          instance._event._last_pos = { x: e.offsetX, y: e.offsetY }
	        }
	      }
	    }
	  }
	  instance._dom._svg.onmouseup = function(e) {
	    // cancelEvent(instance)
	  }
	  instance._dom._svg.onmouseleave = function(e) {
	    cancelEvent(instance)
	  }

	  instance._dom._svg.onclick = function(e) {
	    // Compute nearest
	    let mouse_pos = instance.Cartesian_getPositionFromScreen({ x: e.offsetX, y: e.offsetY })
	    handleNearest(instance, mouse_pos)

	    // If was a drag (or edit: point drag) event, cancel everything AND STOP
	    if ((instance._events_active._drag || instance._events_active._edit) && instance._event._is_drag) {
	      e.preventDefault()
	      e.stopPropagation()
	      cancelEvent(instance)
	      return // Creak
	    }
	    // In other case, just stop the `_event` triggering (or move after the click will fire the `_drag` events)
	    cancelEvent(instance)

	    // If nearest ?
	    if (instance._nearest) {
	      instance._nearest.setSelected(!instance._nearest.getSelected())
	      return // Break event
	    } else if (instance._selected) {
	      instance._selected.setSelected(false)
	    }
	  }

	  instance._dom._svg.onmousewheel = function(e) {
	    if (instance._events_active._scale) {
	      let delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail))) // [-1 - 1]
	      if (delta > 0) {
	        instance.Cartesian_zoomIn()
	      }
	      if (delta < 0) {
	        instance.Cartesian_zoomOut()
	      }
	    }
	  }

	  window.onresize = function(e) {
	    let svgSize = instance._dom._svg.getBoundingClientRect()
	    instance._svgSize = svgSize
	    instance._cartesian._svgSize = svgSize
	    instance._reDraw()
	  }
	}

	let reDraw = function () {
	  let instance = this
	    // @TODO: Redo it better :/ We don't want to destoy and rebuild it each time
	  if (instance._cartesian._dom) {
	    let parent = instance._cartesian._dom.parentElement
	    if (parent) {
	      parent.removeChild(instance._cartesian._dom)
	    }
	  }
	  // Have to display something
	  if (instance._cartesian._haveToBeDraw(instance._cartesian)) {
	    // delete this._cartesian._dom
	    instance._cartesian._dom = instance._cartesian._createSVG(instance._cartesian)
	    // instance._dom._svg.appendChild(instance._cartesian._dom)
	    instance._dom._svg.insertBefore(instance._cartesian._dom, instance._dom._svg.firstChild)
	  }
	  // Loop dots
	  instance._els.forEach(el => {
	    if (el._type === 'point') {
	      // Calculate new position and update
	      el.setPosition(el._pos)
	    }
	  })

	  return instance
	}

	let loadPublicPrototypes = function(Smarthy) {
	  // Ref to axis
	  Smarthy.prototype.X_AXIS = 'x-axis'
	  Smarthy.prototype.Y_AXIS = 'y-axis'

	  Smarthy.prototype._reDraw = reDraw

	  Smarthy.prototype.getTheme = function() {
	    return this._theme
	  }
	  Smarthy.prototype.setTheme = function(theme) {
	    this._dom._svg.classList.remove(this._theme) // Remove old
	    this._theme = theme
	    this._dom._svg.classList.add(this._theme) // Add new
	    return this
	  }
	  Smarthy.prototype.getEvents = function(type, active) {
	    return this._events_active['_' + type]
	  }
	  Smarthy.prototype.setEvents = function(type, active) {
	    this._events_active['_' + type] = !!active
	    if (type === 'edit') {
	      this._dom._svg.classList[this._events_active._edit ? 'add' : 'remove']('editable')
	    }
	    return this
	  }
	  Smarthy.prototype.getNear = function(type) {
	    return this._near['_' + type]
	  }
	  Smarthy.prototype.setNear = function(type, value) {
	    if (type === 'active') {
	      this._near._active = !!value
	      return this
	    }
	    this._near['_' + type] = value
	    return this
	  }
	  Smarthy.prototype.getMagnet = function(type) {
	    return this._magnet['_' + type]
	  }
	  Smarthy.prototype.setMagnet = function(type, value) {
	    if (type === 'active') {
	      this._magnet._active = !!value
	      return this
	    }
	    this._magnet['_' + type] = value
	    return this
	  }

	  Cartesian.loadPublicPrototypes(Smarthy)
	  Points.loadPublicPrototypes(Smarthy)
	  Paths.loadPublicPrototypes(Smarthy)


	  // Private

	  Smarthy.prototype._getNextId = function() {
	    this._els_idx++
	    return "el-" + this._els_idx
	  }
	}

	let handleNearest = function(instance, pos) {
	  let near_distance = instance._near._active ?
	    Math.max(instance._near._distance, UNACTIVATED_NEAR_DISTANCE) :
	    UNACTIVATED_NEAR_DISTANCE

	  // px -> unit
	  let max_distance = near_distance / instance._cartesian._scale._value
	  let nearest = null
	  let nearest_distance = max_distance
	  instance.Points_getPoints().forEach(el => {
	    let distance = el.getDistanceWith(pos)
	    // Near
	    let is_near = (distance <= max_distance)
	    el._setNear(is_near)
	    // Nearest
	    if (is_near && (distance <= nearest_distance)) {
	      nearest_distance = distance
	      nearest = el
	    }
	  })

	  // It's the same nearest
	  if (instance._nearest && nearest && (instance._nearest.id === nearest.id)) {
	    return // Do nothing
	  }

	  // Old nearest
	  if (instance._nearest) {
	    // Remove ref
	    instance._nearest._setNearest(false)
	    // If no new
	    if (!nearest) {
	      instance._nearest = null
	      instance._dom._svg.classList.remove('have-nearest')
	    }
	  }
	  // New nearest
	  if (nearest) {
	    nearest._setNearest(true)
	    instance._nearest = nearest
	    instance._dom._svg.classList.add('have-nearest')
	  }
	}

	let cancelEvent = function(instance) {
	  instance._event = {}
	  instance._dom._svg.classList.remove('drag')
	}

	let getMagnetPosition = function(instance, pos) {
	  let magnet_distance = instance._magnet._active ?
	    Math.max(instance._magnet._distance, UNACTIVATED_MAGNET_DISTANCE) :
	    UNACTIVATED_MAGNET_DISTANCE

	  // px -> unit
	  let max_distance = magnet_distance / instance._cartesian._scale._value
	  pos = Utils.getValidPos(pos)

	  // Stick to X or Y axis ?
	  let x_abs = Math.abs(pos.x)
	  let y_abs = Math.abs(pos.y)
	  if (x_abs <= max_distance || y_abs <= max_distance) {
	    // Update pos
	    if (x_abs <= max_distance) {
	      pos.x = 0
	    }
	    if (y_abs <= max_distance) {
	      pos.y = 0
	    }
	    return pos
	  }

	  // Nothing to stick with
	  return null
	}


	loadSmarthy(window)



/***/ },
/* 1 */
/***/ function(module, exports) {

	let Utils = {
	  createTagSVG: function(type, opts) {
	    let tag = document.createElementNS('http://www.w3.org/2000/svg', type);
	    for (let k in opts)
	        tag.setAttribute(k, opts[k]);
	    return tag
	  },
	  getDistanceBetween: function(a, b) {
	    // Pre-define empty value
	    if (typeof a === 'undefined') {
	      a = { x: 0, y: 0 }
	    }
	    if (typeof b === 'undefined') {
	      b = { x: 0, y: 0 }
	    }

	    let pos_a = null
	    let pos_b = null
	    // It's points ?
	    if (a._type === 'point') {
	      pos_a = a._pos
	    }
	    if (b._type === 'point') {
	      pos_b = b._pos
	    }
	    // It's pos ?
	    if (typeof a.x !== 'undefined' || typeof a.y !== 'undefined') {
	      pos_a = a
	    }
	    if (typeof b.x !== 'undefined' || typeof b.y !== 'undefined') {
	      pos_b = b
	    }

	    // We have to get the distance between 2 Points or Positions
	    if (pos_a && pos_b) {
	      return getDistanceBetweenPositions(pos_a, pos_b)
	    }

	    // I don't know how to do this
	    if (!pos_a) {
	      throw new Error("Can found position for element A")
	    }
	    if (!pos_b) {
	      throw new Error("Can found position for element B")
	    }
	  },
	  getValidPos: function(pos) {
	    return {
	      x: (pos && typeof pos.x !== 'undefined') ? pos.x : 0,
	      y: (pos && typeof pos.y !== 'undefined') ? pos.y : 0,
	    }
	  },
	  // pos should be in opts.pos but opts.x opts.y must work
	  getOptsPos: function(opts) {
	    return {
	      x: opts.pos && opts.pos.x || opts.x || 0,
	      y: opts.pos && opts.pos.y || opts.y || 0,
	    }
	  }
	}

	// Add a prototype to Number
	Number.prototype.formatNumber = function(c, d, t) {
	  let _s = this.toString().split('.')
	  let _c = _s[1] ? _s[1].length : 0
	  var n = this,
	    c = isNaN(c = Math.abs(c)) ? _c : c,
	    d = d == undefined ? "." : d,
	    t = t == undefined ? "," : t,
	    s = n < 0 ? "-" : "",
	    i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))),
	    j = (j = i.length) > 3 ? j % 3 : 0;
	  return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
	}

	let getDistanceBetweenPositions = function(p1, p2) {
	  let a = (p1.x || 0) - (p2.x || 0)
	  let b = (p1.y || 0) - (p2.y || 0)
	  return Math.sqrt( a*a + b*b )
	}

	// Export
	module.exports = Utils

/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * @TODO here
	 *   - When Zoom In/Out, center the action on the cursor position
	 *       (try to zoom when cartesian pos is {x: -5000, y: 0})
	 *   - ZoomIn / ZoomOut / setScale can also receive a center position
	 *      - for scrool : use the mouse poisiton
	 *      - for api, default is the center of the screen
	 *          (get the center position (mesure and screen))
	 *          (create a basic scale update (the center of the screen))
	 *          (move the center mesure to the same screen position than before)
	 */


	let Utils = __webpack_require__(1)

	let COUNT_SCALE = 15 // 15 line per branch
	let SCALE_STEP = 1 // 25px / line for scale 1

	let MIN_RULER = 4
	let MAX_RULER = MIN_RULER * 10

	let SCALE_STRENGHT = 1.1 // Multiplication / Division of the scale
	let MAX_SCALE = 100000
	let MIN_SCALE = .01

	/* OPTIONS:
	 *-----------**
	 *  cartesian: {
	 *    pos: {       // Pixel Position
	 *      x: -1050,
	 *      y: 25,
	 *    },
	 *    scale: 100,   // Initial Zoom (Number of pixel displayed for each "mesure")
	 *    display: {    // Display elements
	 *      axis: true,
	 *      ruler: true,
	 *      orthonormal: true,
	 *      scale: true
	 *    }
	 *  }
	 */
	let Cartesian = function(instance, opts) {
	  let cartesian = this

	  // Set options without dependency
	  cartesian._display = {
	    _axis: ((opts.display && typeof opts.display.axis !== 'undefined') ? opts.display.axis : true),
	    _ruler: ((opts.display && typeof opts.display.ruler !== 'undefined') ? opts.display.ruler : true),
	    _orthonormal: ((opts.display && typeof opts.display.orthonormal !== 'undefined') ? opts.display.orthonormal : true),
	    _scale: ((opts.display && typeof opts.display.scale !== 'undefined') ? opts.display.scale : true),
	  }
	  cartesian._scale = {
	    _value: opts.scale && opts.scale.value || 100, // How many `px` for 1`mesure`
	    _min: opts.scale && opts.scale.min || MIN_SCALE,
	    _max: opts.scale && opts.scale.max || MAX_SCALE,
	    _strenght: opts.scale && opts.scale.strenght || SCALE_STRENGHT,
	  }
	  cartesian._svgSize = instance._svgSize

	  // Calculate the position of the Cartesian center based on `mesure` (not px)
	  // Same than `getScreenPosition` but without using instance
	  cartesian._pos = Utils.getOptsPos(opts)

	  if (haveToBeDraw(cartesian)) {
	    cartesian._dom = createSVG(cartesian)
	    instance._dom._svg.insertBefore(cartesian._dom, instance._dom._svg.firstChild)
	  }
	  return cartesian
	}

	// PRIVATE
	Cartesian.prototype._getScreenPosition = function(pos) {
	  // Init to 0:0 (or required pos)
	  pos = Utils.getValidPos(pos)

	  // Update with the pos of the cartesian
	  pos.x += this._pos.x
	  pos.y += this._pos.y

	  // Add `1scale` for every `pos`
	  pos.x = pos.x * this._scale._value
	  pos.y = -pos.y * this._scale._value

	  // Center the initial 0
	  pos.x += this._svgSize.width / 2
	  pos.y += this._svgSize.height / 2

	  return pos // result
	}
	Cartesian.prototype._getPositionFromScreen = function(pos) {
	  pos = Utils.getValidPos(pos)

	  pos.x -= this._svgSize.width / 2
	  pos.y -= this._svgSize.height / 2

	  pos.x = pos.x / this._scale._value
	  pos.y = -pos.y / this._scale._value

	  pos.x -= this._pos.x
	  pos.y -= this._pos.y

	  if (pos.y === -0) { // weird stuff append
	    pos.y = 0
	  }

	  return pos
	}
	Cartesian.prototype._haveToBeDraw = function() {
	  return haveToBeDraw(this)
	}
	Cartesian.prototype._createSVG = function() {
	  return createSVG(this)
	}


	// PULBIC
	CartesianExport = {
	  create: function (instance, opts) {
	    return new Cartesian(instance, opts)
	  },

	  // Add prototype on smarthy to handle Cartesian
	  loadPublicPrototypes: function(Smarthy) {
	    Smarthy.prototype.Cartesian_getScale = function (type) {
	      return this._cartesian._scale['_' + type]
	    }
	    Smarthy.prototype.Cartesian_getPosition = function () {
	      return this._cartesian._pos
	    }
	    Smarthy.prototype.Cartesian_getDisplay = function (type) {
	      return this._cartesian._display['_' + type]
	    }

	    Smarthy.prototype.Cartesian_zoomIn = function (strenght) {
	      let _strenght = strenght || this._cartesian._scale._strenght
	      let scale =  this._cartesian._scale._value * _strenght
	      this._cartesian._scale._value = Math.max(this._cartesian._scale._min, Math.min(this._cartesian._scale._max, scale))
	      this._reDraw()
	      return this
	    }
	    Smarthy.prototype.Cartesian_zoomOut = function (strenght) {
	      let _strenght = (strenght || this._cartesian._scale._strenght || 1) // Dont /0
	      let scale = this._cartesian._scale._value / _strenght
	      this._cartesian._scale._value = Math.max(this._cartesian._scale._min, Math.min(this._cartesian._scale._max, scale))
	      this._reDraw()
	      return this
	    }
	    Smarthy.prototype.Cartesian_setScale = function (type, value) {
	      if (type === 'value') {
	        this._cartesian._scale._value = Math.max(this._cartesian._scale._min, Math.min(this._cartesian._scale._max, value || this._cartesian._scale._value))
	        this._reDraw()
	      }
	      else {
	        if ((type === 'strenght') && !value) {
	          throw new Error("Strenght can't be null")
	          return
	        }
	        this._cartesian._scale['_' + type] = value
	      }
	      return this
	    }
	    /* pos in `mesure` */
	    Smarthy.prototype.Cartesian_setPosition = function (pos) {
	      // Calculate the position of the Cartesian center based on `mesure` (not px)
	      // Same than `getScreenPosition` but without using instance
	      this._cartesian._pos = {
	        x: pos && (typeof pos.x !== 'undefined') ? pos.x : 0,
	        y: pos && (typeof pos.y !== 'undefined') ? pos.y : 0,
	      }
	      this._reDraw()
	      return this
	    }
	    Smarthy.prototype.Cartesian_translate = function (delta) {
	      let pos = this

	      this._cartesian._pos.x += delta && (typeof delta.x !== 'undefined') ? delta.x : 0,
	      this._cartesian._pos.y += delta && (typeof delta.y !== 'undefined') ? delta.y : 0,

	      this._reDraw()
	      return this
	    }


	    Smarthy.prototype.Cartesian_setDisplay = function (type, displayed) {
	      this._cartesian._display['_' + type] = !!displayed

	      this._reDraw()
	      return this
	    }

	    Smarthy.prototype.Cartesian_getScreenPosition = function(pos) {
	      return this._cartesian._getScreenPosition(pos)
	    }

	    Smarthy.prototype.Cartesian_getPositionFromScreen = function(pos) {
	      return this._cartesian._getPositionFromScreen(pos)
	    }
	  }
	}

	let haveToBeDraw = function(cartesian) {
	  // Ruler is not take account (used only when axis is displayed)
	  return (cartesian._display._axis || cartesian._display._orthonormal || cartesian._display._scale)
	}

	let createSVG = function(cartesian) {
	  let pos = cartesian._getScreenPosition() // Cartesian pos is 0:0
	  let scale = cartesian._scale
	  let display = cartesian._display

	  // g Can't be positionned
	  let dom = Utils.createTagSVG('g', {class: 'cartesian-group'})
	  let scaleRatio = getCartesianRuleScaleRatio(scale._value, cartesian._svgSize)
	  let step = scaleRatio * scale._value

	  if (display._axis) {
	    // Top line
	    let y_axis = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-y-axis', x1: pos.x, y1: 0, x2: pos.x, y2: cartesian._svgSize.height})
	    dom.appendChild(y_axis)
	    // Left line
	    let x_axis = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-left', x1: 0, y1: pos.y, x2: cartesian._svgSize.width, y2: pos.y})
	    dom.appendChild(x_axis)

	    if (display._ruler) {
	      // X Axis

	      // Start / End position of the screen on the cartesian
	      let start = -pos.x
	      let end = start + cartesian._svgSize.width
	      let first = (-start % step)
	      if (first < 0) {
	        first += step
	      }
	      // Index of this first element (0,0 is 0)
	      let idx = Math.ceil(start / step)
	      for (let position = first; position < cartesian._svgSize.width; position += step) {
	        if ((idx !== 0) && ((idx !== 1) || !display._orthonormal)) {
	          let size = 4
	          let classes = 'cartesian-line cartesian-axis-x-ruler'
	          if (Math.abs(idx) % 10 === 0) {
	            classes += ' cartesian-strong'
	            if (Math.abs(idx) % 100 === 0) {
	              size = 10
	            }
	          }
	          let x_scale = Utils.createTagSVG('line', {'data-rule-idx': idx, class: classes, x1: position, y1: pos.y - size , x2: position, y2: pos.y + size})
	          dom.appendChild(x_scale)
	        }
	        idx++
	      }

	      // Y Axis (inversed ;) enjoy)

	      // Start / End position of the screen on the cartesian
	      start = -pos.y
	      end = start + cartesian._svgSize.height
	      first = (-start % step)
	      if (first < 0) {
	        first += step
	      }
	      // Index of this first element (0,0 is 0)
	      idx = -Math.ceil(start / step)
	      for (let position = first; position < cartesian._svgSize.height; position += step) {
	        if ((idx !== 0) && ((idx !== 1) || !display._orthonormal)) {
	          let size = 4
	          let classes = 'cartesian-line cartesian-axis-y-ruler'
	          if (Math.abs(idx) % 10 === 0) {
	            classes += ' cartesian-strong'
	            if (Math.abs(idx) % 100 === 0) {
	              size = 10
	            }
	          }
	          let y_scale = Utils.createTagSVG('line', {'data-rule-idx': idx, class: classes, x1: pos.x - size, y1: position , x2: pos.x + size, y2: position})
	          dom.appendChild(y_scale)
	        }
	        idx--
	      }
	    }
	  }

	  // Stronger line
	  if (display._orthonormal) {
	    let strongTop = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-ortonormal cartesian-strong cartesian-strong-axis-y', x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y - step})
	    dom.appendChild(strongTop)
	    let strongTopL = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-ortonormal cartesian-strong cartesian-strong-axis-y-arrow-left', x1: pos.x - 5, y1: pos.y - step + 5, x2: pos.x, y2: pos.y - step})
	    dom.appendChild(strongTopL)
	    let strongTopR = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-ortonormal cartesian-strong cartesian-strong-axis-y-arrow-right', x1: pos.x + 5, y1: pos.y - step + 5, x2: pos.x, y2: pos.y - step})
	    dom.appendChild(strongTopR)

	    let strongLeft = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-ortonormal cartesian-strong cartesian-strong-axis-x', x1: pos.x, y1: pos.y, x2: pos.x + step, y2: pos.y})
	    dom.appendChild(strongLeft)
	    let strongLeftT = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-ortonormal cartesian-strong cartesian-strong-axis-x-arrow-top', x1: pos.x + step - 5, y1: pos.y - 5, x2: pos.x + step, y2: pos.y})
	    dom.appendChild(strongLeftT)
	    let strongLeftB = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-ortonormal cartesian-strong cartesian-strong-axis-x-arrow-bottom', x1: pos.x + step - 5, y1: pos.y + 5, x2: pos.x + step, y2: pos.y})
	    dom.appendChild(strongLeftB)
	  }

	  // Scale
	  if (display._scale) {
	    let scale = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-strong cartesian-scale', x1: 10, y1: cartesian._svgSize.height - 10, x2: 10 + step, y2: cartesian._svgSize.height - 10})
	    dom.appendChild(scale)
	    let scaleLeft = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-strong cartesian-scale-left', x1: 10, y1: cartesian._svgSize.height - 14, x2: 10, y2: cartesian._svgSize.height - 6})
	    dom.appendChild(scaleLeft)
	    let scaleRight = Utils.createTagSVG('line', {class: 'cartesian-line cartesian-strong cartesian-scale-right', x1: 10 + step, y1: cartesian._svgSize.height - 14, x2: 10 + step, y2: cartesian._svgSize.height - 6})
	    dom.appendChild(scaleRight)
	    let scaleText = Utils.createTagSVG('text', {class: 'cartesian-text cartesian-scale-text', x: 10 + (step / 2), y: cartesian._svgSize.height - 20, 'text-anchor': "middle"})
	    scaleText.innerHTML = parseFloat(scaleRatio).formatNumber() // @TODO: Redo ^^
	    dom.appendChild(scaleText)
	  }

	  return dom
	}
	let getCartesianRuleScaleRatio = function(scale_value, svgSize) {
	  // Don't /0
	  scale_value = scale_value || 1
	  let count_width = (svgSize.width / scale_value)
	  let count_height = (svgSize.height / scale_value)
	  let count_max = Math.max(count_width, count_height)
	  let result = 1 // [..., .001, .01, 1, .1, 10, 100, ...]

	  let security = 0
	  if (count_max > MAX_RULER) {
	    while (count_max > 20 || security > 20) {
	      count_max = count_max / 10
	      result = result * 10
	      security++
	    }
	  }
	  security = 0
	  if (count_max < MIN_RULER) {
	    while (count_max < 5 || security > 20) {
	      count_max = count_max * 10
	      result = result / 10
	      security++
	    }
	  }

	  return result
	}

	module.exports = CartesianExport

/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	/*
	 * @TODO here
	 * - [true/false] Display the position of the point on ruler
	 * - Create a prototype rotate(angle[, center])
	 * - Handle the magnet for the point when drag
	 * - Exeption if 2 element are created with the same name !
	 */

	let Utils = __webpack_require__(1)

	// Create a new point
	let Points = function(instance, opts) {
	  opts = opts || {}
	  let pos = Utils.getOptsPos(opts)
	  let cartesian_pos = instance._cartesian._getScreenPosition(pos)

	  let id = instance._getNextId()
	  let editable = !!opts.editable
	  let attr = {
	    id: id,
	    class: 'point el' + (editable ? ' editable' : ''),
	    cx: cartesian_pos.x,
	    cy: cartesian_pos.y,
	    r: '4',
	    'el-type': 'point'
	  }
	  let dom = Utils.createTagSVG('circle', attr)

	  // Generate element
	  let el = this
	  el.id = id
	  el._type = 'point'
	  el._name = opts.name || null
	  el._pos =  pos
	  el._editable = editable
	  el._dom = dom

	  el._near = false
	  el._nearest = false
	  el._selected = false
	  el._refs = [] // All Object wh refere to this point (have to be updated when point is updated)

	  // Keep for prototype function :/
	  el._instance = instance

	  instance._els.push(el)

	  // Apped child first
	  instance._dom._points.appendChild(dom)

	  loadPointListeners(el)

	  return el
	}

	Points.prototype.getPosition = function() {
	  return this._pos
	}
	Points.prototype.setPosition = function(pos) {
	  let screen_pos = this._instance.Cartesian_getScreenPosition(pos)
	  this._pos = pos
	  this._dom.setAttribute('cx', screen_pos.x)
	  this._dom.setAttribute('cy', screen_pos.y)

	  this._refs.forEach(ref => {
	    ref.el._pointPositionUpdated(this, ref.ref_data)
	  })

	  return this
	}
	Points.prototype.getEditable = function() {
	  return this._editable
	}
	Points.prototype.setEditable = function(editable) {
	  editable = !!editable
	  if (this._editable === editable) {
	    return this
	  }
	  this._editable = editable
	  this._dom.classList[this._editable ? 'add' : 'remove']('editable')
	  return this
	}
	Points.prototype.getSelected = function() {
	  return this._selected
	}
	Points.prototype.setSelected = function(selected) {
	  selected = !!selected
	  if (this._selected === selected) {
	    return this
	  }
	  this._selected = selected
	  this._dom.classList[this._selected ? 'add' : 'remove']('selected')

	  // In every case, unselect old
	  if (this._instance._selected) {
	    this._instance._selected.setSelected(false)
	    this._instance._selected = null
	  }
	  // This one is the new selected
	  if (this._selected) {
	    this._instance._selected = this
	  }

	  return this
	}
	Points.prototype.translate = function (delta) {
	  let pos = this.getPosition()
	  pos.x += delta && (typeof delta.x !== 'undefined') ? delta.x : 0
	  pos.y += delta && (typeof delta.y !== 'undefined') ? delta.y : 0
	  this.setPosition(pos)
	  return this
	}

	// `el` can be a position
	Points.prototype.getDistanceWith = function(el) {
	  return Utils.getDistanceBetween(this, el)
	}
	// filter:
	//  {id} || {name}
	//  {object} :
	//    {id, name, pos}
	Points.prototype.is = function(filter) {
	  if ( ! (typeof filter === 'string' || filter.id || filter.name || filter.pos || filter.x || filter.y)) {
	    return false
	  }
	  // direct Id or Name
	  if ((filter === this.id) || (filter === this._name)) {
	    return true
	  }
	  // Object
	  if (filter.id && (filter.id !== this.id)) {
	    return false
	  }
	  if (filter.name && (filter.name !== this._name)) {
	    return false
	  }
	  if (typeof filter.x !== 'undefined'
	    || typeof filter.y !== 'undefined'
	    || filter.pos) {
	    // Dont use Utils.getValidPos (filter can search only for {x:0})
	    let x = (filter.pos && filter.pos.x) || filter.x || null
	    let y = (filter.pos && filter.pos.y) || filter.y || null
	    if (x !== null && this._pos.x !== x) {
	      return false
	    }
	    if (y !== null && this._pos.y !== y) {
	      return false
	    }
	  }
	  return true
	}


	// PRIVATE prototype
	Points.prototype._setNear = function(near) {
	  this._near = !!near
	  this._dom.classList[this._near ? 'add' : 'remove']('near')
	  return this
	}
	Points.prototype._setNearest = function(nearest) {
	  this._nearest = !!nearest
	  this._dom.classList[this._nearest ? 'add' : 'remove']('nearest')
	  return this
	}
	Points.prototype._addReference = function(el, ref_data) {
	  this._refs.push({el: el, ref_data: ref_data})
	  return this
	}

	var PointsExport = {
	  loadPublicPrototypes: function(Smarthy) {
	    Smarthy.prototype.Points_getPoints = function (filter) {
	      let instance = this
	      let points = []

	      instance._els.forEach(el => {
	        if (el._type === 'point') {
	          if (!filter || el.is(filter)) {
	            points.push(el)
	          }
	        }
	      })
	      return points
	    }
	    Smarthy.prototype.Points_addPoint = function (opts) {
	      let instance = this
	      return new Points(instance, opts)
	    }
	    Smarthy.prototype.Points_getPoint = function (filter) {
	      if (!filter) {
	        return null
	      }
	      let instance = this
	      let len = instance._els.length
	      for (let idx = 0; idx < len; idx ++) {
	        if (instance._els[idx]._type === 'point' && instance._els[idx].is(filter)) {
	          return instance._els[idx]
	        }
	      }
	      return null
	    }
	  }
	}

	let loadPointListeners = function(el) {
	  el._dom.onmousedown = function(e) {
	    // This events propagation should NEVER be stopped !
	    // _svg require this events after this will be fired
	  }

	  el._dom.onclick = function(e) {
	    // This events propagation should NEVER be stopped !
	    // _svg require this events after this will be fired
	  }
	}

	module.exports = PointsExport

/***/ },
/* 4 */
/***/ function(module, exports, __webpack_require__) {

	
	/*
	 * Add a `closed path` opts (to link last idx to 0)
	 */

	let Utils = __webpack_require__(1)

	// Create a new path
	let Paths = function(instance, opts) {
	  opts = opts || {}

	  let id = instance._getNextId()
	  let el = this
	  el.id = id
	  el._type = 'path'

	  // Create the group
	  el._dom_els = []
	  el._dom = Utils.createTagSVG('g', {
	    id: id,
	    'el-type': 'path'
	  })

	  instance._dom._svg.insertBefore(el._dom, instance._dom._points)

	  // List points for this path
	  el._els = []
	  if (opts.els) {
	    let last_pos = null
	    let idx = 0
	    opts.els.forEach(point_opts => {
	      // Get point, or create if isn't exist
	      let point = instance.Points_getPoint(point_opts)
	      if (!point) {
	        point = instance.Points_addPoint(point_opts)
	      }
	      el._els.push(point)
	      // Keep a reference to this path on the point
	      point._addReference(el, { idx: idx })

	      // Draw between last_pos and point
	      let pos = instance._cartesian._getScreenPosition(point._pos)
	      if (last_pos) {
	        let attr = {
	          id: id + '-segment-' + idx + '-' + (idx + 1),
	          class: 'segment el',
	          x1: last_pos.x,
	          y1: last_pos.y,
	          x2: pos.x,
	          y2: pos.y,
	          'el-type': 'path-segment'
	        }
	        // Create the segment, Keep the ref and append to HTML
	        let dom = Utils.createTagSVG('line', attr)
	        el._dom_els.push(dom)
	        el._dom.appendChild(dom)
	      }
	      last_pos = pos
	      idx++
	    })
	  }

	  // Keep for prototype function :/
	  el._instance = instance

	  // Push to the list of elements
	  instance._els.push(el)

	  // Load listeners
	  loadPathListeners(el)

	  return el
	}

	Paths.prototype._pointPositionUpdated = function(point, ref) {
	  // It's not the first
	  if (ref.idx > 0) {
	    let segment = this._dom_els[ref.idx - 1]
	    let pos = this._instance._cartesian._getScreenPosition(point._pos)
	    segment.setAttribute('x2', pos.x)
	    segment.setAttribute('y2', pos.y)
	  }
	  // It's not the last
	  if (ref.idx < this._els.length - 1) {
	    let segment = this._dom_els[ref.idx]
	    let pos = this._instance._cartesian._getScreenPosition(point._pos)
	    segment.setAttribute('x1', pos.x)
	    segment.setAttribute('y1', pos.y)
	  }
	}


	var PathsExport = {
	  loadPublicPrototypes: function(Smarthy) {
	    Smarthy.prototype.Paths_getPaths = function () {
	      let instance = this
	      let paths = []
	      instance._els.forEach(el => {
	        if (el._type === 'path') {
	          paths.push(el)
	        }
	      })
	      return paths
	    }
	    Smarthy.prototype.Paths_addPath = function(opts) {
	      let instance = this
	      return new Paths(instance, opts)
	    }
	  },
	}

	let loadPathListeners = function(el) {
	  // el._dom.onmousedown = function(e) {
	  //   // This events propagation should NEVER be stopped !
	  //   // _svg require this events after this will be fired
	  // }

	  // el._dom.onclick = function(e) {
	  //   // This events propagation should NEVER be stopped !
	  //   // _svg require this events after this will be fired
	  // }
	}

	module.exports = PathsExport

/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

	// style-loader: Adds some css to the DOM by adding a <style> tag

	// load the styles
	var content = __webpack_require__(6);
	if(typeof content === 'string') content = [[module.id, content, '']];
	// add the styles to the DOM
	var update = __webpack_require__(8)(content, {});
	if(content.locals) module.exports = content.locals;
	// Hot Module Replacement
	if(false) {
		// When the styles change, update the <style> tags
		if(!content.locals) {
			module.hot.accept("!!./../../node_modules/css-loader/index.js!./main.css", function() {
				var newContent = require("!!./../../node_modules/css-loader/index.js!./main.css");
				if(typeof newContent === 'string') newContent = [[module.id, newContent, '']];
				update(newContent);
			});
		}
		// When the module is disposed, remove the <style> tags
		module.hot.dispose(function() { update(); });
	}

/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	exports = module.exports = __webpack_require__(7)();
	// imports


	// module
	exports.push([module.id, "/* SVG */\n.smarthy-svg {\n  display: block;\n  width: 100%;\n  height: 100%;\n  font-family: 'monospace';\n  font-size: 10px;\n}\n.smarthy-svg.dark {\n  background: #222;\n}\n.smarthy-svg.have-nearest {\n  cursor: pointer;\n}\n.smarthy-svg.drag {\n  cursor: move;\n}\n\n/* Cartesian */\n.smarthy-svg .cartesian-line {\n  stroke: #AAA;\n}\n.smarthy-svg.dark .cartesian-line {\n  stroke: #888;\n}\n.smarthy-svg .cartesian-strong, .smarthy-svg.dark .cartesian-strong {\n  stroke: #f8954e;\n}\n\n.cartesian-text {\n  pointer-events: none;\n  -webkit-touch-callout: none;\n  -webkit-user-select: none;\n  -khtml-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n}\n.smarthy-svg.dark .cartesian-text {\n  fill: #AAA;\n}\n.smarthy-svg .cartesian-text {\n  fill: #888;\n}\n\n/* Points */\n.smarthy-svg .point /*, .marthy-svg .cursor*/ {\n  fill: #FFF;\n  stroke: #949494;\n}\n.smarthy-svg.dark .point /*, .marthy-svg .cursor*/ {\n  fill: #222;\n  /*stroke: #949494;*/\n}\n.smarthy-svg.editable .point.editable, .smarthy-svg.editable.dark .point.editable {\n  stroke: #f8954e;\n}\n.smarthy-svg .point.nearest {\n  stroke-width: 2px;\n}\n.smarthy-svg .point.selected, .smarthy-svg.dark .point.selected {\n  fill: #949494;\n}\n.smarthy-svg.editable .point.editable.selected {\n  fill: #f8954e;\n}\n\n/* Segments */\n.smarthy-svg .segment {\n  stroke: #3F3F3F;\n  stroke-width: 2px;\n}\n.smarthy-svg.dark .segment {\n  stroke: #CFCFCF;\n}", ""]);

	// exports


/***/ },
/* 7 */
/***/ function(module, exports) {

	/*
		MIT License http://www.opensource.org/licenses/mit-license.php
		Author Tobias Koppers @sokra
	*/
	// css base code, injected by the css-loader
	module.exports = function() {
		var list = [];

		// return the list of modules as css string
		list.toString = function toString() {
			var result = [];
			for(var i = 0; i < this.length; i++) {
				var item = this[i];
				if(item[2]) {
					result.push("@media " + item[2] + "{" + item[1] + "}");
				} else {
					result.push(item[1]);
				}
			}
			return result.join("");
		};

		// import a list of modules into the list
		list.i = function(modules, mediaQuery) {
			if(typeof modules === "string")
				modules = [[null, modules, ""]];
			var alreadyImportedModules = {};
			for(var i = 0; i < this.length; i++) {
				var id = this[i][0];
				if(typeof id === "number")
					alreadyImportedModules[id] = true;
			}
			for(i = 0; i < modules.length; i++) {
				var item = modules[i];
				// skip already imported module
				// this implementation is not 100% perfect for weird media query combinations
				//  when a module is imported multiple times with different media queries.
				//  I hope this will never occur (Hey this way we have smaller bundles)
				if(typeof item[0] !== "number" || !alreadyImportedModules[item[0]]) {
					if(mediaQuery && !item[2]) {
						item[2] = mediaQuery;
					} else if(mediaQuery) {
						item[2] = "(" + item[2] + ") and (" + mediaQuery + ")";
					}
					list.push(item);
				}
			}
		};
		return list;
	};


/***/ },
/* 8 */
/***/ function(module, exports, __webpack_require__) {

	/*
		MIT License http://www.opensource.org/licenses/mit-license.php
		Author Tobias Koppers @sokra
	*/
	var stylesInDom = {},
		memoize = function(fn) {
			var memo;
			return function () {
				if (typeof memo === "undefined") memo = fn.apply(this, arguments);
				return memo;
			};
		},
		isOldIE = memoize(function() {
			return /msie [6-9]\b/.test(window.navigator.userAgent.toLowerCase());
		}),
		getHeadElement = memoize(function () {
			return document.head || document.getElementsByTagName("head")[0];
		}),
		singletonElement = null,
		singletonCounter = 0,
		styleElementsInsertedAtTop = [];

	module.exports = function(list, options) {
		if(false) {
			if(typeof document !== "object") throw new Error("The style-loader cannot be used in a non-browser environment");
		}

		options = options || {};
		// Force single-tag solution on IE6-9, which has a hard limit on the # of <style>
		// tags it will allow on a page
		if (typeof options.singleton === "undefined") options.singleton = isOldIE();

		// By default, add <style> tags to the bottom of <head>.
		if (typeof options.insertAt === "undefined") options.insertAt = "bottom";

		var styles = listToStyles(list);
		addStylesToDom(styles, options);

		return function update(newList) {
			var mayRemove = [];
			for(var i = 0; i < styles.length; i++) {
				var item = styles[i];
				var domStyle = stylesInDom[item.id];
				domStyle.refs--;
				mayRemove.push(domStyle);
			}
			if(newList) {
				var newStyles = listToStyles(newList);
				addStylesToDom(newStyles, options);
			}
			for(var i = 0; i < mayRemove.length; i++) {
				var domStyle = mayRemove[i];
				if(domStyle.refs === 0) {
					for(var j = 0; j < domStyle.parts.length; j++)
						domStyle.parts[j]();
					delete stylesInDom[domStyle.id];
				}
			}
		};
	}

	function addStylesToDom(styles, options) {
		for(var i = 0; i < styles.length; i++) {
			var item = styles[i];
			var domStyle = stylesInDom[item.id];
			if(domStyle) {
				domStyle.refs++;
				for(var j = 0; j < domStyle.parts.length; j++) {
					domStyle.parts[j](item.parts[j]);
				}
				for(; j < item.parts.length; j++) {
					domStyle.parts.push(addStyle(item.parts[j], options));
				}
			} else {
				var parts = [];
				for(var j = 0; j < item.parts.length; j++) {
					parts.push(addStyle(item.parts[j], options));
				}
				stylesInDom[item.id] = {id: item.id, refs: 1, parts: parts};
			}
		}
	}

	function listToStyles(list) {
		var styles = [];
		var newStyles = {};
		for(var i = 0; i < list.length; i++) {
			var item = list[i];
			var id = item[0];
			var css = item[1];
			var media = item[2];
			var sourceMap = item[3];
			var part = {css: css, media: media, sourceMap: sourceMap};
			if(!newStyles[id])
				styles.push(newStyles[id] = {id: id, parts: [part]});
			else
				newStyles[id].parts.push(part);
		}
		return styles;
	}

	function insertStyleElement(options, styleElement) {
		var head = getHeadElement();
		var lastStyleElementInsertedAtTop = styleElementsInsertedAtTop[styleElementsInsertedAtTop.length - 1];
		if (options.insertAt === "top") {
			if(!lastStyleElementInsertedAtTop) {
				head.insertBefore(styleElement, head.firstChild);
			} else if(lastStyleElementInsertedAtTop.nextSibling) {
				head.insertBefore(styleElement, lastStyleElementInsertedAtTop.nextSibling);
			} else {
				head.appendChild(styleElement);
			}
			styleElementsInsertedAtTop.push(styleElement);
		} else if (options.insertAt === "bottom") {
			head.appendChild(styleElement);
		} else {
			throw new Error("Invalid value for parameter 'insertAt'. Must be 'top' or 'bottom'.");
		}
	}

	function removeStyleElement(styleElement) {
		styleElement.parentNode.removeChild(styleElement);
		var idx = styleElementsInsertedAtTop.indexOf(styleElement);
		if(idx >= 0) {
			styleElementsInsertedAtTop.splice(idx, 1);
		}
	}

	function createStyleElement(options) {
		var styleElement = document.createElement("style");
		styleElement.type = "text/css";
		insertStyleElement(options, styleElement);
		return styleElement;
	}

	function createLinkElement(options) {
		var linkElement = document.createElement("link");
		linkElement.rel = "stylesheet";
		insertStyleElement(options, linkElement);
		return linkElement;
	}

	function addStyle(obj, options) {
		var styleElement, update, remove;

		if (options.singleton) {
			var styleIndex = singletonCounter++;
			styleElement = singletonElement || (singletonElement = createStyleElement(options));
			update = applyToSingletonTag.bind(null, styleElement, styleIndex, false);
			remove = applyToSingletonTag.bind(null, styleElement, styleIndex, true);
		} else if(obj.sourceMap &&
			typeof URL === "function" &&
			typeof URL.createObjectURL === "function" &&
			typeof URL.revokeObjectURL === "function" &&
			typeof Blob === "function" &&
			typeof btoa === "function") {
			styleElement = createLinkElement(options);
			update = updateLink.bind(null, styleElement);
			remove = function() {
				removeStyleElement(styleElement);
				if(styleElement.href)
					URL.revokeObjectURL(styleElement.href);
			};
		} else {
			styleElement = createStyleElement(options);
			update = applyToTag.bind(null, styleElement);
			remove = function() {
				removeStyleElement(styleElement);
			};
		}

		update(obj);

		return function updateStyle(newObj) {
			if(newObj) {
				if(newObj.css === obj.css && newObj.media === obj.media && newObj.sourceMap === obj.sourceMap)
					return;
				update(obj = newObj);
			} else {
				remove();
			}
		};
	}

	var replaceText = (function () {
		var textStore = [];

		return function (index, replacement) {
			textStore[index] = replacement;
			return textStore.filter(Boolean).join('\n');
		};
	})();

	function applyToSingletonTag(styleElement, index, remove, obj) {
		var css = remove ? "" : obj.css;

		if (styleElement.styleSheet) {
			styleElement.styleSheet.cssText = replaceText(index, css);
		} else {
			var cssNode = document.createTextNode(css);
			var childNodes = styleElement.childNodes;
			if (childNodes[index]) styleElement.removeChild(childNodes[index]);
			if (childNodes.length) {
				styleElement.insertBefore(cssNode, childNodes[index]);
			} else {
				styleElement.appendChild(cssNode);
			}
		}
	}

	function applyToTag(styleElement, obj) {
		var css = obj.css;
		var media = obj.media;

		if(media) {
			styleElement.setAttribute("media", media)
		}

		if(styleElement.styleSheet) {
			styleElement.styleSheet.cssText = css;
		} else {
			while(styleElement.firstChild) {
				styleElement.removeChild(styleElement.firstChild);
			}
			styleElement.appendChild(document.createTextNode(css));
		}
	}

	function updateLink(linkElement, obj) {
		var css = obj.css;
		var sourceMap = obj.sourceMap;

		if(sourceMap) {
			// http://stackoverflow.com/a/26603875
			css += "\n/*# sourceMappingURL=data:application/json;base64," + btoa(unescape(encodeURIComponent(JSON.stringify(sourceMap)))) + " */";
		}

		var blob = new Blob([css], { type: "text/css" });

		var oldSrc = linkElement.href;

		linkElement.href = URL.createObjectURL(blob);

		if(oldSrc)
			URL.revokeObjectURL(oldSrc);
	}


/***/ }
/******/ ]);