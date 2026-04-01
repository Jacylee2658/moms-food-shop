const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session setup
app.use(session({
    secret: 'moms-food-shop-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database connection
const db = require('./config/db');

// Test database connection
async function testDb() {
    try {
        await db.query('SELECT NOW()');
        console.log('✅ Connected to PostgreSQL database');
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
    }
}
testDb();

// Homepage - Show all products
app.get('/', async (req, res) => {
    try {
        const productsResult = await db.query(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.is_available = true
        `);
        
        const categoriesResult = await db.query('SELECT * FROM categories ORDER BY id');
        
        res.render('index', { 
            products: productsResult.rows,
            categories: categoriesResult.rows,
            categoryId: null,
            title: 'Mama Jude\'s Food Shop'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error: ' + err.message);
    }
});

// Products by category
app.get('/category/:id', async (req, res) => {
    try {
        const categoryId = req.params.id;
        
        const productsResult = await db.query(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.category_id = $1 AND p.is_available = true
        `, [categoryId]);
        
        const categoriesResult = await db.query('SELECT * FROM categories ORDER BY id');
        
        res.render('index', { 
            products: productsResult.rows,
            categories: categoriesResult.rows,
            categoryId: parseInt(categoryId),
            title: 'Mama Jude\'s Food Shop'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error: ' + err.message);
    }
});

// Product detail page
app.get('/product/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        
        const result = await db.query(`
            SELECT p.*, c.name as category_name 
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = $1
        `, [productId]);
        
        if (result.rows.length === 0) {
            return res.status(404).send('Product not found');
        }
        
        const product = result.rows[0];
        
        res.render('product', { 
            product: product,
            title: product.name
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error: ' + err.message);
    }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});


// Checkout page
app.get('/checkout', (req, res) => {
    res.render('checkout', { 
        title: 'Checkout - Mama Jude\'s Food Shop'
    });
});

// Process checkout
app.post('/checkout', async (req, res) => {
    try {
        const { name, phone, pickup_time, notes, cart_data } = req.body;
        
        // Parse cart data
        const cart = JSON.parse(cart_data);
        
        // Calculate total
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // Generate order number
        const timestamp = Date.now().toString().slice(-8);
        const random = Math.floor(Math.random() * 1000);
        const orderNumber = `ORD-${timestamp}-${random}`;
        
        // Insert order
        const orderResult = await db.query(`
            INSERT INTO orders (order_number, total_amount, status, pickup_time, customer_name, customer_phone, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [orderNumber, total, 'pending', pickup_time, name, phone, notes]);
        
        const orderId = orderResult.rows[0].id;
        
        // Insert order items
        for (const item of cart) {
            await db.query(`
                INSERT INTO order_items (order_id, product_name, quantity, price_at_time)
                VALUES ($1, $2, $3, $4)
            `, [orderId, item.name, item.quantity, item.price]);
        }
        
        // ========== WHATSAPP NOTIFICATION ==========
        // Create order items list for WhatsApp
        let orderItemsList = '';
        cart.forEach(item => {
            orderItemsList += `\n• ${item.name} x ${item.quantity} = ₦${(item.price * item.quantity).toLocaleString()}`;
        });
        
        // Create WhatsApp message
        const whatsappMessage = `
🛒 *NEW ORDER RECEIVED!* 🛒

*Order Number:* ${orderNumber}
*Customer Name:* ${name}
*Phone:* ${phone}
*Pickup Time:* ${pickup_time}

*Items Ordered:*
${orderItemsList}

*Total Amount:* ₦${total.toLocaleString()}

*Notes:* ${notes || 'None'}

Please prepare this order for pickup.
        `;
        
        console.log('📱 WhatsApp Message:');
        console.log(whatsappMessage);
        
        // For now, we'll just log it to console
        // To actually send WhatsApp, you can:
        // 1. Copy this message manually and send to mom
        // 2. Use Twilio API (paid)
        // 3. Use WhatsApp Business API
        // 4. Send email instead
        
        // Simple way: Open WhatsApp with pre-filled message (optional)
        // This will open WhatsApp on mom's phone if she clicks the link
        const encodedMessage = encodeURIComponent(whatsappMessage);
        const whatsappLink = `https://wa.me/2347061437700?text=${encodedMessage}`; // Replace with mom's number
        console.log('WhatsApp link:', whatsappLink);
        
        // ========== END WHATSAPP CODE ==========
        
        res.json({ 
            success: true, 
            orderNumber: orderNumber,
            message: 'Order placed successfully!',
            whatsappLink: whatsappLink  // Optional: send this to frontend
        });
        
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error placing order: ' + err.message 
        });
    }
});


// Admin login page
app.get('/admin/login', (req, res) => {
    res.render('admin/login', { title: 'Admin Login' });
});

// Admin login POST
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Simple admin check (you can change these credentials)
    if (username === 'mamajude' && password === 'admin123') {
        req.session.isAdmin = true;
        res.redirect('/admin/dashboard');
    } else {
        res.send('Invalid credentials');
    }
});

// Admin dashboard
app.get('/admin/dashboard', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin/login');
    }
    
    try {
        const orders = await db.query(`
            SELECT * FROM orders 
            ORDER BY created_at DESC 
            LIMIT 20
        `);
        
        const products = await db.query('SELECT * FROM products');
        
        res.render('admin/dashboard', { 
            orders: orders.rows,
            products: products.rows,
            title: 'Admin Dashboard'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error loading dashboard');
    }
});

// Update order status
app.post('/admin/order/:id/status', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(401).send('Unauthorized');
    }
    
    const { id } = req.params;
    const { status } = req.body;
    
    await db.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    res.redirect('/admin/dashboard');
});

// Add new product
app.post('/admin/product', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(401).send('Unauthorized');
    }
    
    const { name, description, price, stock_quantity, category_id, unit } = req.body;
    
    await db.query(`
        INSERT INTO products (name, description, price, stock_quantity, category_id, unit, is_available)
        VALUES ($1, $2, $3, $4, $5, $6, true)
    `, [name, description, price, stock_quantity, category_id, unit]);
    
    res.redirect('/admin/dashboard');
});

// Update product
app.post('/admin/product/:id/update', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(401).send('Unauthorized');
    }
    
    const { id } = req.params;
    const { price, stock_quantity, is_available } = req.body;
    
    await db.query(`
        UPDATE products 
        SET price = $1, stock_quantity = $2, is_available = $3
        WHERE id = $4
    `, [price, stock_quantity, is_available === 'true', id]);
    
    res.redirect('/admin/dashboard');
});
// Logout
app.get('/admin/logout', (req, res) => {
    req.session.isAdmin = false;
    res.redirect('/admin/login');
});

