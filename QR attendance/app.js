/**
 * QR Attendance System - Mock Backend & Logic
 * Uses localStorage to simulate a database.
 */

const AppDB = {
  getUsers: () => JSON.parse(localStorage.getItem('users') || '[]'),
  setUsers: (users) => localStorage.setItem('users', JSON.stringify(users)),
  
  getSessions: () => JSON.parse(localStorage.getItem('sessions') || '[]'),
  setSessions: (sessions) => localStorage.setItem('sessions', JSON.stringify(sessions)),
  
  getAttendances: () => JSON.parse(localStorage.getItem('attendances') || '[]'),
  setAttendances: (attendances) => localStorage.setItem('attendances', JSON.stringify(attendances)),

  getCurrentUser: () => JSON.parse(localStorage.getItem('currentUser') || 'null'),
  setCurrentUser: (user) => localStorage.setItem('currentUser', JSON.stringify(user)),
  logout: () => localStorage.removeItem('currentUser')
};

/**
 * Authentication Logic
 */
const Auth = {
  register: (name, email, password, role) => {
    const users = AppDB.getUsers();
    if (users.find(u => u.email === email)) {
      throw new Error("Email already exists");
    }
    const newUser = {
      id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2),
      name,
      email,
      password, // In a real app, hash this!
      role
    };
    users.push(newUser);
    AppDB.setUsers(users);
    return newUser;
  },

  login: (email, password) => {
    const users = AppDB.getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      throw new Error("Invalid email or password");
    }
    // Remove password from session
    const { password: _, ...userSession } = user;
    AppDB.setCurrentUser(userSession);
    return userSession;
  },

  logout: () => {
    AppDB.logout();
  },

  requireRole: (role) => {
    const user = AppDB.getCurrentUser();
    if (!user) {
      window.location.href = 'index.html';
      return null;
    }
    if (role && user.role !== role) {
      window.location.href = user.role === 'TEACHER' ? 'teacher.html' : 'student.html';
      return null;
    }
    return user;
  }
};

/**
 * Session & Attendance Logic
 */
const AttendanceSys = {
  createSession: (teacherId, title, lat, lng) => {
    const sessions = AppDB.getSessions();
    // Deactivate previous active sessions for this teacher
    sessions.forEach(s => {
      if(s.teacherId === teacherId) s.active = false;
    });

    const newSession = {
      id: 'ses_' + Date.now().toString(36),
      title,
      teacherId,
      latitude: lat,
      longitude: lng,
      active: true,
      createdAt: new Date().toISOString()
    };
    sessions.push(newSession);
    AppDB.setSessions(sessions);
    return newSession;
  },

  getTeacherSessions: (teacherId) => {
    return AppDB.getSessions().filter(s => s.teacherId === teacherId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getSessionDetails: (sessionId) => {
    const session = AppDB.getSessions().find(s => s.id === sessionId);
    if(!session) return null;
    
    const attendances = AppDB.getAttendances()
      .filter(a => a.sessionId === sessionId)
      .map(a => {
        const student = AppDB.getUsers().find(u => u.id === a.studentId);
        return { ...a, studentName: student ? student.name : 'Unknown' };
      });
      
    return { session, attendances };
  },

  getStudentAttendances: (studentId) => {
    const sessions = AppDB.getSessions();
    return AppDB.getAttendances()
      .filter(a => a.studentId === studentId)
      .map(a => {
        const session = sessions.find(s => s.id === a.sessionId);
        return { ...a, sessionTitle: session ? session.title : 'Unknown' };
      })
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  // Token format: sessionId|timestamp
  generateQRToken: (sessionId) => {
    return btoa(`${sessionId}|${Date.now()}`);
  },

  getDistance: (lat1, lon1, lat2, lon2) => {
    if(!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371e3; 
    const p1 = lat1 * Math.PI/180; 
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // in metres
  },

  submitAttendance: (token, studentId, studentLat, studentLng) => {
    try {
      const decoded = atob(token);
      const [sessionId, timestampStr] = decoded.split('|');
      const timestamp = parseInt(timestampStr);

      // Check Expiry (30 seconds)
      if (Date.now() - timestamp > 30000) {
        throw new Error("QR Code Expired. Please scan the latest code.");
      }

      const session = AppDB.getSessions().find(s => s.id === sessionId);
      if (!session || !session.active) {
        throw new Error("Session is not active.");
      }

      // Geolocation check if session has coordinates
      if (session.latitude && session.longitude) {
        if (!studentLat || !studentLng) {
          throw new Error("Location required to mark attendance.");
        }
        const dist = AttendanceSys.getDistance(session.latitude, session.longitude, studentLat, studentLng);
        if (dist > 100) {
          throw new Error(`You are too far from class (${Math.round(dist)}m).`);
        }
      }

      // Check Duplicates
      const attendances = AppDB.getAttendances();
      const existing = attendances.find(a => a.sessionId === sessionId && a.studentId === studentId);
      if (existing) {
        throw new Error("Attendance already recorded.");
      }

      // Record
      attendances.push({
        id: 'att_' + Date.now(),
        sessionId,
        studentId,
        timestamp: new Date().toISOString()
      });
      AppDB.setAttendances(attendances);

      return true;
    } catch (err) {
      throw err;
    }
  }
};
