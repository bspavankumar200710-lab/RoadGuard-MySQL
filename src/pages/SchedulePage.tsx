import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
  AlertTriangle,
  Flame,
  Wrench,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  ArrowUpDown,
  Car,
  ShieldCheck,
  Eye,
  Sparkles,
} from 'lucide-react';
import {
  pageVariants,
  cardHoverProps,
  buttonPressProps,
  staggerContainerVariants,
  staggerItemVariants,
  springs,
  expandCollapseVariants,
  popInVariants,
} from '../utils/motion';
import { RoadHazardRecord } from '../types/detection';

export interface MunicipalTask {
  id: string;
  title: string;
  location: string;
  priority: 'P1_CRITICAL' | 'P2_ELEVATED' | 'P3_STANDARD';
  assignedCrew: string;
  completed: boolean;
  dueDate: string;
  estimatedHours: number;
  hazardType: 'pothole' | 'road_crack' | 'broken_sign' | 'general';
}

export interface CalendarEvent {
  id: string;
  title: string;
  location: string;
  date: string; // YYYY-MM-DD
  time: string;
  duration: string;
  crew: string;
  type: 'patrol' | 'repair' | 'inspection';
  priority: 'high' | 'medium' | 'low';
}

const INITIAL_TASKS: MunicipalTask[] = [
  {
    id: 'task-1',
    title: 'Emergency cold-mix pothole patch',
    location: 'Outer Ring Road, Bellandur Flyover',
    priority: 'P1_CRITICAL',
    assignedCrew: 'Zone 4 Maintenance Unit',
    completed: false,
    dueDate: 'Today, 2:00 PM',
    estimatedHours: 2.5,
    hazardType: 'pothole',
  },
  {
    id: 'task-2',
    title: 'Asphalt crack sealing & sealant injection',
    location: 'Koramangala 80ft Road, 4th Block',
    priority: 'P2_ELEVATED',
    assignedCrew: 'Asphalt Team Alpha',
    completed: false,
    dueDate: 'Tomorrow, 9:30 AM',
    estimatedHours: 4.0,
    hazardType: 'road_crack',
  },
  {
    id: 'task-3',
    title: 'Regulatory stop sign replacement',
    location: 'Indiranagar 100ft Road Junction',
    priority: 'P2_ELEVATED',
    assignedCrew: 'Traffic Signage Unit',
    completed: true,
    dueDate: 'Yesterday',
    estimatedHours: 1.0,
    hazardType: 'broken_sign',
  },
  {
    id: 'task-4',
    title: 'Pre-monsoon drainage & manhole inspection',
    location: 'MG Road to Cubbon Park Perimeter',
    priority: 'P3_STANDARD',
    assignedCrew: 'Civil Engineering Team 2',
    completed: false,
    dueDate: 'Oct 05, 11:00 AM',
    estimatedHours: 3.0,
    hazardType: 'general',
  },
];

const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'event-1',
    title: 'High-Density Corridor Patrol',
    location: 'Bellandur to Whitefield ITPB',
    date: '2026-10-03',
    time: '09:00 AM',
    duration: '2h 30m',
    crew: 'Rapid Response Patrol 1',
    type: 'patrol',
    priority: 'high',
  },
  {
    id: 'event-2',
    title: 'Emergency Pothole Patching Operation',
    location: 'Outer Ring Road (Koramangala)',
    date: '2026-10-03',
    time: '02:00 PM',
    duration: '3h 00m',
    crew: 'Asphalt Crew Alpha',
    type: 'repair',
    priority: 'high',
  },
  {
    id: 'event-3',
    title: 'AI Vision Mobile Scanner Run',
    location: 'Indiranagar & Domlur Corridors',
    date: '2026-10-04',
    time: '10:00 AM',
    duration: '1h 45m',
    crew: 'Sensor Rig Unit 03',
    type: 'inspection',
    priority: 'medium',
  },
  {
    id: 'event-4',
    title: 'Traffic Sign & Lane Markings Audit',
    location: 'Malleswaram & RT Nagar',
    date: '2026-10-05',
    time: '11:30 AM',
    duration: '2h 00m',
    crew: 'Signage Maintenance Crew',
    type: 'inspection',
    priority: 'low',
  },
];

interface SchedulePageProps {
  detections: RoadHazardRecord[];
  onNavigateToMap: (hazardId?: string) => void;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({ detections, onNavigateToMap }) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar'>('tasks');
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('week');
  const [tasks, setTasks] = useState<MunicipalTask[]>(INITIAL_TASKS);
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [hoveredEvent, setHoveredEvent] = useState<CalendarEvent | null>(null);

  // New Task Inline Creation State
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskLocation, setNewTaskLocation] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<MunicipalTask['priority']>('P2_ELEVATED');

  // Toggle task completion with spring animation
  const handleToggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  // Delete task with smooth exit animation
  const handleDeleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  // Reorder task upward or downward
  const handleMoveTask = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tasks.length) return;
    const newTasks = [...tasks];
    const temp = newTasks[index];
    newTasks[index] = newTasks[targetIndex];
    newTasks[targetIndex] = temp;
    setTasks(newTasks);
  };

  // Create new task
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const task: MunicipalTask = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      location: newTaskLocation.trim() || 'Monitored City Sector',
      priority: newTaskPriority,
      assignedCrew: 'Dispatched Maintenance Crew',
      completed: false,
      dueDate: 'Scheduled for Tomorrow',
      estimatedHours: 2.0,
      hazardType: 'pothole',
    };

    setTasks((prev) => [task, ...prev]);
    setNewTaskTitle('');
    setNewTaskLocation('');
    setIsAddingTask(false);
  };

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'pending') return !t.completed;
    if (taskFilter === 'completed') return t.completed;
    return true;
  });

  const completedCount = tasks.filter((t) => t.completed).length;
  const progressPercent = Math.round((completedCount / Math.max(1, tasks.length)) * 100);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"
    >
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-5 sm:p-7 text-white shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="space-y-1.5 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 border border-indigo-400/40 text-indigo-200">
              Operations & Logistics
            </span>
            <span className="text-xs text-indigo-300">• Municipal Workflow Hub</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Road Maintenance & Patrol Schedule
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Dispatch repair work orders, track asphalt patching crews, and organize automated AI road monitoring patrols.
          </p>
        </div>

        {/* View Switcher with Animated Highlight Pill */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800 shrink-0 relative">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`relative z-10 px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'tasks' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
            <span>Work Orders ({tasks.length})</span>
            {activeTab === 'tasks' && (
              <motion.div
                layoutId="activeScheduleTab"
                transition={springs.snappy}
                className="absolute inset-0 bg-blue-600 rounded-xl -z-10 shadow-md shadow-blue-600/30"
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            className={`relative z-10 px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 ${
              activeTab === 'calendar' ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CalendarIcon className="w-4 h-4 text-indigo-400" />
            <span>Patrol Calendar</span>
            {activeTab === 'calendar' && (
              <motion.div
                layoutId="activeScheduleTab"
                transition={springs.snappy}
                className="absolute inset-0 bg-indigo-600 rounded-xl -z-10 shadow-md shadow-indigo-600/30"
              />
            )}
          </button>
        </div>
      </div>

      {/* Progress & Quick Stats Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Repair Progress
            </span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              {completedCount} / {tasks.length}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {progressPercent}% work orders closed
            </div>
          </div>
          {/* Animated SVG Progress Ring */}
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="18"
                stroke="#e2e8f0"
                strokeWidth="4"
                fill="transparent"
              />
              <motion.circle
                cx="24"
                cy="24"
                r="18"
                stroke="#3b82f6"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray={113}
                initial={{ strokeDashoffset: 113 }}
                animate={{ strokeDashoffset: 113 - (113 * progressPercent) / 100 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-[10px] font-black text-slate-800">
              {progressPercent}%
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 block">
              Critical P1 Repairs
            </span>
            <div className="text-2xl font-black text-rose-600 mt-0.5">
              {tasks.filter((t) => t.priority === 'P1_CRITICAL' && !t.completed).length}
            </div>
            <div className="text-[11px] text-slate-500">Requires emergency response</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 block">
              Active Patrol Crews
            </span>
            <div className="text-2xl font-black text-indigo-600 mt-0.5">4 Units</div>
            <div className="text-[11px] text-slate-500">Equipped with AI Vision cameras</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <Car className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* VIEW 1: WORK ORDERS & TASK MANAGEMENT */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Controls Bar: Filters & New Task Trigger */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                <span>Filter:</span>
              </span>

              {(['all', 'pending', 'completed'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTaskFilter(filter)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all capitalize ${
                    taskFilter === filter
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <motion.button
              {...buttonPressProps}
              onClick={() => setIsAddingTask(!isAddingTask)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Work Order</span>
            </motion.button>
          </div>

          {/* New Task Inline Form with Smooth Expand/Collapse */}
          <AnimatePresence>
            {isAddingTask && (
              <motion.form
                variants={expandCollapseVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleCreateTask}
                className="overflow-hidden bg-slate-900 border border-slate-700/80 p-4 sm:p-5 rounded-2xl text-white shadow-xl space-y-3.5"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-white flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-blue-400" />
                    <span>New Municipal Maintenance Task</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsAddingTask(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Task summary (e.g. Patch deep pothole)..."
                    className="sm:col-span-2 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    required
                  />

                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="P1_CRITICAL">🚨 P1 Critical Priority</option>
                    <option value="P2_ELEVATED">⚠️ P2 Elevated Priority</option>
                    <option value="P3_STANDARD">📋 P3 Standard Priority</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <input
                    type="text"
                    value={newTaskLocation}
                    onChange={(e) => setNewTaskLocation(e.target.value)}
                    placeholder="Road corridor / address (e.g. Indiranagar 100ft Road)..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />

                  <motion.button
                    {...buttonPressProps}
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center gap-1.5 shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Task</span>
                  </motion.button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Animated Reorderable Task List */}
          <motion.div
            variants={staggerContainerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-2.5"
          >
            <AnimatePresence mode="popLayout">
              {filteredTasks.map((task, index) => {
                const isCritical = task.priority === 'P1_CRITICAL';
                const isElevated = task.priority === 'P2_ELEVATED';

                return (
                  <motion.div
                    key={task.id}
                    layout
                    variants={staggerItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, scale: 0.95, y: -6, transition: { duration: 0.18 } }}
                    className={`p-4 rounded-2xl border transition-colors flex items-center justify-between gap-3 group ${
                      task.completed
                        ? 'bg-slate-50 border-slate-200/60 opacity-65'
                        : 'bg-white border-slate-200/90 shadow-sm hover:shadow-md'
                    }`}
                  >
                    {/* Left: Animated Checkbox & Task Details */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      {/* Spring Checkbox */}
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => handleToggleTask(task.id)}
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          task.completed
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 hover:border-blue-500 bg-white'
                        }`}
                        title={task.completed ? 'Mark pending' : 'Mark completed'}
                      >
                        {task.completed && (
                          <motion.div
                            variants={popInVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </motion.div>
                        )}
                      </motion.button>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4
                            className={`font-bold text-xs sm:text-sm tracking-tight truncate ${
                              task.completed ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {task.title}
                          </h4>

                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              isCritical
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : isElevated
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {task.priority.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1">
                          <span className="flex items-center gap-1 text-slate-600 font-medium">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>{task.location}</span>
                          </span>

                          <span>•</span>

                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{task.dueDate}</span>
                          </span>

                          <span>•</span>

                          <span className="text-slate-600 font-mono">
                            Est: {task.estimatedHours}h ({task.assignedCrew})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions (Up, Down, Pin, Delete) */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Move Up/Down */}
                      <button
                        onClick={() => handleMoveTask(index, 'up')}
                        disabled={index === 0}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                        title="Move priority up"
                      >
                        <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
                      </button>

                      <button
                        onClick={() => handleMoveTask(index, 'down')}
                        disabled={index === filteredTasks.length - 1}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 transition-colors"
                        title="Move priority down"
                      >
                        <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                      </button>

                      <button
                        onClick={() => onNavigateToMap()}
                        className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Locate on map"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                        title="Remove task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* VIEW 2: INTERACTIVE CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-5">
          {/* Calendar Top Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Municipal Patrol & Repair Schedule
                </h3>
                <p className="text-xs text-slate-500">October 2026 • Bengaluru Highway Network</p>
              </div>
            </div>

            {/* Day / Week / Month Pill Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
              {(['day', 'week', 'month'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setCalendarView(view)}
                  className={`px-3 py-1 rounded-lg capitalize transition-all ${
                    calendarView === view
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Weekly Days Grid */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Scheduled Events Feed */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Upcoming Scheduled Deployments</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {events.map((evt) => {
                const isRepair = evt.type === 'repair';
                const isHigh = evt.priority === 'high';

                return (
                  <motion.div
                    key={evt.id}
                    {...cardHoverProps}
                    onMouseEnter={() => setHoveredEvent(evt)}
                    onMouseLeave={() => setHoveredEvent(null)}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-indigo-300 transition-all cursor-pointer relative shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              isHigh
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {evt.type.toUpperCase()}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            {evt.date} • {evt.time}
                          </span>
                        </div>

                        <h5 className="font-extrabold text-sm text-slate-900 mt-1">{evt.title}</h5>

                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{evt.location}</span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-lg block">
                          {evt.duration}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1 block font-medium">
                          {evt.crew}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
