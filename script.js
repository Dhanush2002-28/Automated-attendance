import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
    getDatabase,
    ref,
    onChildAdded,
    get,
    set,
    remove,
    query,
    orderByChild,
    startAfter
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

const firebaseConfig = {
    databaseURL: 'https://attendancesystem-903ce-default-rtdb.firebaseio.com'
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const attendanceRef = ref(database, 'attendance');
const approvalsRef = ref(database, 'approvals');
const usersRef = ref(database, 'attendance_users');

const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const table = document.getElementById('attendanceTable');
const tbody = document.getElementById('attendanceBody');
const totalStudentsEl = document.getElementById('totalStudents');
const todayAttendanceEl = document.getElementById('todayAttendance');
const weekAttendanceEl = document.getElementById('weekAttendance');
const studentSelect = document.getElementById('studentSelect');
const studentDetails = document.getElementById('studentDetails');
const studentNameEl = document.getElementById('studentName');
const studentTotalEl = document.getElementById('studentTotal');
const studentLastSeenEl = document.getElementById('studentLastSeen');

let attendanceData = [];
let students = new Set();
let processedRecords = new Set(); // Track processed records to avoid duplicate emails

// Store the page load timestamp to use as a threshold for new records
const pageLoadTime = Date.now();

// Chart objects
let attendanceChart = null;
let studentChart = null;

// EmailJS configuration - Add your own public key and template IDs
const EMAILJS_PUBLIC_KEY = "-_QwyRCyK9w_n9kcc"; // Replace with your EmailJS public key
const EMAILJS_SERVICE_ID = "service_2ug1cdb"; // Replace with your EmailJS service ID
const EMAILJS_TEMPLATE_ID = "template_9j5yd55"; // Replace with your EmailJS template ID

// Initialize EmailJS
(function() {
    emailjs.init(EMAILJS_PUBLIC_KEY);
})();

// Improved function to format dates with correct timezone handling
function formatDate(timestamp) {
    try {
        // Ensure the timestamp is a number
        const ts = Number(timestamp);
        
        if (isNaN(ts)) {
            console.error("Invalid timestamp format:", timestamp);
            return "Invalid Date";
        }
        
        // Create date object
        const date = new Date(ts);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.error("Invalid date object from timestamp:", timestamp);
            return "Invalid Date";
        }
        
        // Use toLocaleString with explicit timezone to ensure consistent display
        return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch (e) {
        console.error("Error in formatDate:", e);
        return "Date Error";
    }
}

// Improved function to send email notification with correct timestamp
function sendEmailNotification(name, email, timestamp, recordId) {
    // Skip if this record was already processed
    if (processedRecords.has(recordId)) {
        console.log(`Email for record ${recordId} already sent, skipping`);
        return;
    }
    
    if (!email) {
        console.error("No email provided for notification");
        return;
    }

    // Convert timestamp to milliseconds if it's in seconds
    if (timestamp < 10000000000) { // If timestamp appears to be in seconds
        timestamp = timestamp * 1000;
    }
    
    // Only send email if this record is recent (within the last 5 minutes)
    const emailTimeWindow = parseInt(localStorage.getItem('email_time_window') || '5');
    const cutoffTime = Date.now() - (emailTimeWindow * 60 * 1000);
    
    if (timestamp < cutoffTime) {
        console.log(`Record ${recordId} is older than ${emailTimeWindow} minutes, not sending email`);
        return;
    }
    
    const formattedDate = formatDate(timestamp);
    
    const templateParams = {
        to_name: name,
        to_email: email,
        attendance_time: formattedDate,
        message: `Your attendance was recorded at ${formattedDate}`
    };

    emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
        .then(function(response) {
            console.log('Email sent:', response.status, response.text);
            // Mark this record as processed
            processedRecords.add(recordId);
            // Save to localStorage to persist across page reloads
            saveProcessedRecords();
        }, function(error) {
            console.error('Email failed:', error);
        });
}

// Save processed records to localStorage
function saveProcessedRecords() {
    localStorage.setItem('processed_records', JSON.stringify([...processedRecords]));
}

// Load processed records from localStorage
function loadProcessedRecords() {
    const stored = localStorage.getItem('processed_records');
    if (stored) {
        try {
            const records = JSON.parse(stored);
            processedRecords = new Set(records);
        } catch (e) {
            console.error("Error loading processed records:", e);
            processedRecords = new Set();
        }
    }
}

function updateStats() {
    const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todayCount = attendanceData.filter(record => {
        return new Date(Number(record.timestamp)).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === today;
    }).length;

    const weekCount = attendanceData.filter(record => {
        return new Date(Number(record.timestamp)) >= weekAgo;
    }).length;

    totalStudentsEl.textContent = students.size;
    todayAttendanceEl.textContent = todayCount;
    weekAttendanceEl.textContent = weekCount;
}

function updateTable() {
    const nameFilter = document.getElementById('nameFilter').value.toLowerCase();
    const dateFilter = document.getElementById('dateFilter').value;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);

    tbody.innerHTML = '';

    const filtered = attendanceData.filter(record => {
        const nameMatch = record.name?.toLowerCase().includes(nameFilter);
        if (!nameMatch) return false;

        const date = new Date(Number(record.timestamp));
        if (dateFilter === 'today') return date.toDateString() === today.toDateString();
        if (dateFilter === 'yesterday') return date.toDateString() === yesterday.toDateString();
        if (dateFilter === 'week') return date >= weekAgo;
        if (dateFilter === 'month') return date >= monthAgo;
        return true;
    });

    filtered.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
      <td>${record.name}</td>
      <td>${record.uid}</td>
      <td>${formatDate(record.timestamp)}</td>
    `;
        row.onclick = () => {
            showSection('students');
            studentSelect.value = record.name;
            showStudentDetails();
        };
        tbody.appendChild(row);
    });

    table.style.display = filtered.length ? 'table' : 'none';
}

function showSection(id) {
    ['dashboard', 'graphs', 'students', 'settings', 'approvals'].forEach(s => {
        document.getElementById(s).style.display = s === id ? 'block' : 'none';
    });

    if (id === 'approvals') loadApprovals();
    if (id === 'graphs') updateCharts();
    if (id === 'students') populateStudentSelect();
}

function loadApprovals() {
    const approvalList = document.getElementById('approvalList');
    approvalList.innerHTML = 'Loading...';

    get(approvalsRef).then(snapshot => {
        approvalList.innerHTML = '';
        if (!snapshot.exists()) {
            approvalList.innerHTML = '<p>No pending approvals.</p>';
            return;
        }

        const data = snapshot.val();
        Object.entries(data).forEach(([uid, record]) => {
            // Handle the timestamp properly
            let formattedDate = "Invalid Date";
            
            try {
                // Check if timestamp exists
                if (record.timestamp) {
                    // Handle different possible formats
                    const timestamp = 
                        // If it's already a number
                        typeof record.timestamp === 'number' ? record.timestamp :
                        // If it's a string that can be parsed directly
                        !isNaN(Number(record.timestamp)) ? Number(record.timestamp) :
                        // If it's a Firebase server timestamp object
                        record.timestamp['.sv'] === 'timestamp' ? Date.now() : null;
                    
                    if (timestamp) {
                        // Apply the timestamp fix
                        const fixedTimestamp = fixTimestampFormat(timestamp);
                        formattedDate = formatDate(fixedTimestamp);
                    }
                }
            } catch (e) {
                console.error("Error formatting date:", e);
            }

            const div = document.createElement('div');
            div.className = 'approval-item';
            div.innerHTML = `
        <p><strong>UID:</strong> ${uid}</p>
        <p><strong>Scanned At:</strong> ${formattedDate}</p>
        <input type="text" placeholder="Enter Name" id="name-${uid}" />
        <input type="email" placeholder="Enter Email" id="email-${uid}" />
        <button onclick="approveUser('${uid}')">Approve</button>
        <hr/>
      `;
            approvalList.appendChild(div);
        });
    });
}

// Graph functions
function updateCharts() {
    const graphFilter = document.getElementById('graphFilter').value;
    updateAttendanceChart(graphFilter);
}

function prepareChartData(records, period = 'daily') {
    // Group attendance data by date according to the period
    const groupedData = {};
    const today = new Date();
    let startDate, endDate = today;
    let dateFormat;
    
    // Set the start date based on period
    switch(period) {
        case 'daily':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 14); // Last 14 days
            dateFormat = date => date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
            break;
        case 'weekly':
            startDate = new Date(today);
            startDate.setMonth(startDate.getMonth() - 3); // Last 3 months for weekly view
            dateFormat = date => {
                const weekStart = new Date(date);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                return `Week of ${weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' })}`;
            };
            break;
        case 'monthly':
            startDate = new Date(today);
            startDate.setFullYear(startDate.getFullYear() - 1); // Last 12 months
            dateFormat = date => date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
            break;
    }
    
    // Initialize periods in the date range
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        let key;
        
        if (period === 'daily') {
            key = dateFormat(currentDate);
        } else if (period === 'weekly') {
            const weekStart = new Date(currentDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            key = dateFormat(weekStart);
        } else if (period === 'monthly') {
            key = currentDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        }
        
        groupedData[key] = 0;
        
        // Move to next period
        if (period === 'daily') {
            currentDate.setDate(currentDate.getDate() + 1);
        } else if (period === 'weekly') {
            currentDate.setDate(currentDate.getDate() + 7);
        } else if (period === 'monthly') {
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }
    
    // Count attendance for each period
    records.forEach(record => {
        try {
            // Fix timestamp if needed
            const timestamp = fixTimestampFormat(Number(record.timestamp));
            const date = new Date(timestamp);
            
            if (date >= startDate && date <= endDate) {
                let key;
                
                if (period === 'daily') {
                    key = dateFormat(date);
                } else if (period === 'weekly') {
                    const weekStart = new Date(date);
                    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                    key = dateFormat(weekStart);
                } else if (period === 'monthly') {
                    key = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                }
                
                if (key in groupedData) {
                    groupedData[key]++;
                }
            }
        } catch (e) {
            console.error("Error processing date in chart data:", e);
        }
    });
    
    return {
        labels: Object.keys(groupedData),
        data: Object.values(groupedData)
    };
}

function updateAttendanceChart(period = 'daily') {
    const ctx = document.getElementById('attendanceChart').getContext('2d');
    
    // Prepare data based on the selected period
    const { labels, data } = prepareChartData(attendanceData, period);
    
    // Destroy existing chart if it exists
    if (attendanceChart) {
        attendanceChart.destroy();
    }
    
    // Create new chart
    attendanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Attendance Count',
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0 // Only show whole numbers
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${period.charAt(0).toUpperCase() + period.slice(1)} Attendance Trends`
                },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            return tooltipItems[0].label;
                        },
                        label: function(context) {
                            return `Attendance: ${context.raw}`;
                        }
                    }
                }
            }
        }
    });
}

function populateStudentSelect() {
    // Clear existing options except the first one
    while (studentSelect.options.length > 1) {
        studentSelect.remove(1);
    }
    
    // Sort students alphabetically
    const sortedStudents = Array.from(students).sort();
    
    // Add student options
    sortedStudents.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        studentSelect.appendChild(option);
    });
}

function showStudentDetails() {
    const selectedStudent = studentSelect.value;
    
    if (!selectedStudent) {
        studentDetails.style.display = 'none';
        return;
    }
    
    // Filter attendance records for selected student
    const studentRecords = attendanceData.filter(record => record.name === selectedStudent);
    
    if (studentRecords.length === 0) {
        studentDetails.style.display = 'none';
        return;
    }
    
    // Sort records by timestamp (most recent first)
    studentRecords.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    
    // Update student details UI
    studentNameEl.textContent = selectedStudent;
    studentTotalEl.textContent = studentRecords.length;
    studentLastSeenEl.textContent = formatDate(studentRecords[0].timestamp);
    
    // Show student details
    studentDetails.style.display = 'block';
    
    // Update student chart
    updateStudentChart(studentRecords);
}

function updateStudentChart(studentRecords) {
    const ctx = document.getElementById('studentChart').getContext('2d');
    
    // Prepare data - last 30 days of attendance
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Create a map for each day in the last 30 days
    const attendanceDays = {};
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
        attendanceDays[dateStr] = 0;
    }
    
    // Count attendance for each day
    studentRecords.forEach(record => {
        try {
            // Fix timestamp if needed
            const timestamp = fixTimestampFormat(Number(record.timestamp));
            const date = new Date(timestamp);
            
            if (date >= thirtyDaysAgo && date <= today) {
                const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' });
                if (dateStr in attendanceDays) {
                    attendanceDays[dateStr]++;
                }
            }
        } catch (e) {
            console.error("Error processing date in student chart:", e);
        }
    });
    
    // Convert to arrays for Chart.js
    const labels = Object.keys(attendanceDays).reverse();
    const data = Object.values(attendanceDays).reverse();
    
    // Destroy existing chart if it exists
    if (studentChart) {
        studentChart.destroy();
    }
    
    // Create new chart
    studentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Attendance',
                data: data,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 3,
                    ticks: {
                        stepSize: 1,
                        precision: 0
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Attendance in Last 30 Days'
                }
            }
        }
    });
}

// Improved function to fix timestamp format from ESP32
function fixTimestampFormat(timestamp) {
    // Check if timestamp is a string and convert to number
    let ts = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
    
    // If timestamp appears to be in seconds rather than milliseconds
    // (ESP32 sometimes sends Unix time in seconds)
    if (ts < 10000000000) { // If timestamp is before 2001, it's likely in seconds
        ts = ts * 1000;
    }
    
    return ts;
}

window.approveUser = function (uid) {
    const name = document.getElementById(`name-${uid}`).value;
    const email = document.getElementById(`email-${uid}`).value;

    if (!name || !email) {
        alert("Please enter both name and email.");
        return;
    }

    set(ref(database, `attendance_users/${uid}`), {
        uid,
        name,
        email
    }).then(() => {
        remove(ref(database, `approvals/${uid}`));
        alert("User approved successfully!");
        loadApprovals();
    });
};

// Add settings for email configuration
function loadSettings() {
    const settingsForm = document.getElementById('settings');
    
    // Create email settings form if it doesn't exist
    if (!document.getElementById('emailSettings')) {
        const settingsHTML = `
            <div id="emailSettings" class="settings-section">
                <h3>Email Notification Settings</h3>
                <div class="form-group">
                    <label for="emailServiceId">EmailJS Service ID:</label>
                    <input type="text" id="emailServiceId" value="${EMAILJS_SERVICE_ID}" placeholder="Your EmailJS Service ID">
                </div>
                <div class="form-group">
                    <label for="emailTemplateId">EmailJS Template ID:</label>
                    <input type="text" id="emailTemplateId" value="${EMAILJS_TEMPLATE_ID}" placeholder="Your EmailJS Template ID">
                </div>
                <div class="form-group">
                    <label for="emailPublicKey">EmailJS Public Key:</label>
                    <input type="text" id="emailPublicKey" value="${EMAILJS_PUBLIC_KEY}" placeholder="Your EmailJS Public Key">
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="enableEmailNotifications" checked>
                        Enable Email Notifications
                    </label>
                </div>
                <div class="form-group">
                    <label for="emailTimeWindow">Only send emails for records within (minutes):</label>
                    <input type="number" id="emailTimeWindow" min="1" max="60" value="5">
                </div>
                <button onclick="saveEmailSettings()">Save Settings</button>
                <button onclick="testEmailNotification()">Send Test Email</button>
                <button onclick="clearProcessedRecords()">Clear Email History</button>
            </div>
        `;
        
        settingsForm.innerHTML += settingsHTML;
    }
}

// Save email settings
window.saveEmailSettings = function() {
    const serviceId = document.getElementById('emailServiceId').value;
    const templateId = document.getElementById('emailTemplateId').value;
    const publicKey = document.getElementById('emailPublicKey').value;
    const enableNotifications = document.getElementById('enableEmailNotifications').checked;
    const timeWindow = document.getElementById('emailTimeWindow').value;
    
    // Save to localStorage
    localStorage.setItem('emailjs_service_id', serviceId);
    localStorage.setItem('emailjs_template_id', templateId);
    localStorage.setItem('emailjs_public_key', publicKey);
    localStorage.setItem('enable_email_notifications', enableNotifications);
    localStorage.setItem('email_time_window', timeWindow);
    
    // Update global variables
    window.EMAILJS_SERVICE_ID = serviceId;
    window.EMAILJS_TEMPLATE_ID = templateId;
    window.EMAILJS_PUBLIC_KEY = publicKey;
    window.EMAIL_NOTIFICATIONS_ENABLED = enableNotifications;
    window.EMAIL_TIME_WINDOW = timeWindow;
    
    // Reinitialize EmailJS with the new public key
    emailjs.init(publicKey);
    
    alert('Email settings saved successfully!');
};

// Test email notification
window.testEmailNotification = function() {
    const testEmail = prompt("Enter an email address to send a test notification:");
    if (!testEmail) return;
    
    const templateParams = {
        to_name: "Test User",
        to_email: testEmail,
        attendance_time: formatDate(Date.now()),
        message: "This is a test notification from the RFID Attendance System"
    };
    
    emailjs.send(
        document.getElementById('emailServiceId').value,
        document.getElementById('emailTemplateId').value,
        templateParams
    ).then(function(response) {
        alert(`Email sent successfully! Response: ${response.status}`);
    }, function(error) {
        alert(`Failed to send email. Error: ${error}`);
    });
};

// Clear processed records
window.clearProcessedRecords = function() {
    if (confirm("This will reset the email notification history. All records will be treated as new when they are detected again. Continue?")) {
        processedRecords.clear();
        localStorage.removeItem('processed_records');
        alert("Email history cleared successfully.");
    }
};

// Load email settings from localStorage when the application starts
function loadEmailSettings() {
    const storedServiceId = localStorage.getItem('emailjs_service_id');
    const storedTemplateId = localStorage.getItem('emailjs_template_id');
    const storedPublicKey = localStorage.getItem('emailjs_public_key');
    const enableNotifications = localStorage.getItem('enable_email_notifications') !== 'false';
    const timeWindow = localStorage.getItem('email_time_window') || '5';
    
    // Update global variables if stored values exist
    if (storedServiceId) window.EMAILJS_SERVICE_ID = storedServiceId;
    if (storedTemplateId) window.EMAILJS_TEMPLATE_ID = storedTemplateId;
    if (storedPublicKey) {
        window.EMAILJS_PUBLIC_KEY = storedPublicKey;
        emailjs.init(storedPublicKey);
    }
    window.EMAIL_NOTIFICATIONS_ENABLED = enableNotifications;
    window.EMAIL_TIME_WINDOW = timeWindow;
}

// Store the last attendance record timestamp to track what's truly new
let lastKnownRecordTimestamp = 0;

// Set up a listener for only new attendance records
function setupAttendanceListener() {
    // First load all existing records without sending emails
    get(attendanceRef).then((snapshot) => {
        if (snapshot.exists()) {
            const records = snapshot.val();
            let latestTimestamp = 0;
            
            Object.entries(records).forEach(([key, record]) => {
                // Add key to record for reference
                record.key = key;
                
                // Fix timestamp format if needed
                if (record.timestamp) {
                    record.timestamp = fixTimestampFormat(record.timestamp);
                    
                    // Track the latest timestamp seen
                    if (record.timestamp > latestTimestamp) {
                        latestTimestamp = record.timestamp;
                    }
                }
                
                // Add record to processed set to avoid sending emails for existing records
                processedRecords.add(key);
                
                // Add to attendance data
                attendanceData.push(record);
                if (record.name) students.add(record.name);
            });
            
            // Update UI
            updateStats();
            updateTable();
            saveProcessedRecords();
            
            // Record the latest timestamp we've seen on load
            lastKnownRecordTimestamp = latestTimestamp || Date.now();
            
            console.log("Initial data loaded. Latest timestamp:", new Date(lastKnownRecordTimestamp));
        }
        
        loadingDiv.style.display = 'none';
        
        // Now set up a listener for new records added after we loaded
        // This uses a query to only get records newer than the last one we've seen
        const newRecordsQuery = query(
            attendanceRef,
            orderByChild('timestamp'),
            startAfter(lastKnownRecordTimestamp)
        );
        
        onChildAdded(attendanceRef, (snapshot) => {
            const key = snapshot.key;
            const record = snapshot.val();
            
            // Skip if we've already processed this record
            if (processedRecords.has(key)) {
                console.log(`Record ${key} already processed, skipping`);
                return;
            }
            
            console.log("New record detected:", key, record);
            
            // Fix timestamp format if needed
            if (record.timestamp) {
                record.timestamp = fixTimestampFormat(record.timestamp);
                
                // Update latest timestamp if this is newer
                if (record.timestamp > lastKnownRecordTimestamp) {
                    lastKnownRecordTimestamp = record.timestamp;
                }
            }
            
            // Add to attendance data
            attendanceData.push(record);
            if (record.name) students.add(record.name);
            
            // Update UI
            updateStats();
            updateTable();
            
            // Check if this record is actually new (within our time window)
            const emailNotificationsEnabled = localStorage.getItem('enable_email_notifications') !== 'false';
            const emailTimeWindow = parseInt(localStorage.getItem('email_time_window') || '5');
            const cutoffTime = Date.now() - (emailTimeWindow * 60 * 1000);
            
            // Only send emails for truly recent records
            if (emailNotificationsEnabled && record.timestamp > cutoffTime) {
                console.log(`Record ${key} is recent, sending email notification`);
                
                // Find user email for notification if not already in record
                if (!record.email && record.uid) {
                    get(ref(database, `attendance_users/${record.uid}`)).then(userSnapshot => {
                        if (userSnapshot.exists()) {
                            const userData = userSnapshot.val();
                            if (userData.email) {
                                sendEmailNotification(record.name || userData.name, userData.email, record.timestamp, key);
                            }
                        }
                    });
                } else if (record.email) {
                    // Send email notification if email is available
                    sendEmailNotification(record.name, record.email, record.timestamp, key);
                }
            } else {
                console.log(`Record ${key} is too old or notifications disabled, not sending email`);
                // Still mark as processed to avoid future processing
                processedRecords.add(key);
                saveProcessedRecords();
            }
            
            // Update charts if they're currently displayed
            if (document.getElementById('graphs').style.display === 'block') {
                updateCharts();
            }
            
            // Update student details if they're currently displayed
            if (document.getElementById('students').style.display === 'block' && 
                studentSelect.value === record.name) {
                showStudentDetails();
            }
        });// Store last known record timestamp in localStorage to persist between page loads
        localStorage.setItem('last_known_timestamp', lastKnownRecordTimestamp);
    }).catch(error => {
        console.error("Error loading attendance data:", error);
        loadingDiv.style.display = 'none';
        errorDiv.textContent = `Error loading data: ${error.message}`;
        errorDiv.style.display = 'block';
    });
}

// Initialize the application
function init() {
    loadingDiv.style.display = 'block';
    errorDiv.style.display = 'none';
    
    // Load processed records from localStorage
    loadProcessedRecords();
    
    // Load email settings from localStorage
    loadEmailSettings();
    
    // Load last known timestamp if available
    const storedTimestamp = localStorage.getItem('last_known_timestamp');
    if (storedTimestamp) {
        lastKnownRecordTimestamp = Number(storedTimestamp);
    }
    
    // Make these functions accessible globally
    window.showSection = showSection;
    window.updateTable = updateTable;
    window.updateCharts = updateCharts;
    window.showStudentDetails = showStudentDetails;
    
    // Set up attendance listener
    setupAttendanceListener();
    
    // Start with the dashboard view
    showSection('dashboard');
}

// Make the loadSettings function accessible globally
window.loadSettings = loadSettings;

// Add an event listener to load settings when the settings section is shown
const originalShowSection = window.showSection;
window.showSection = function(id) {
    originalShowSection(id);
    if (id === 'settings') {
        loadSettings();
    }
};

// Make the fixTimestampFormat function globally accessible
window.fixTimestampFormat = fixTimestampFormat;

// Start the app
init();