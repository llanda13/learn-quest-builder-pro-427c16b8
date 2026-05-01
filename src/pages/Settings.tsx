
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, User, Bell, Brain, Palette } from "lucide-react";

interface UserSettings {
  notifications: {
    testNotifications: boolean;
    aiUpdates: boolean;
    collaborationAlerts: boolean;
  };
  ai: {
    autoClassify: boolean;
    confidenceThreshold: number;
    autoApprove: boolean;
  };
  display: {
    theme: 'light' | 'dark' | 'system';
    compactMode: boolean;
  };
  profile: {
    fullName: string;
    college: string;
    subject: string;
  };
}

const defaultSettings: UserSettings = {
  notifications: {
    testNotifications: true,
    aiUpdates: true,
    collaborationAlerts: false
  },
  ai: {
    autoClassify: true,
    confidenceThreshold: 0.8,
    autoApprove: false
  },
  display: {
    theme: 'system',
    compactMode: false
  },
  profile: {
    fullName: '',
    college: '',
    subject: ''
  }
};

const Settings = () => {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.settings) {
        const loadedSettings = data.settings as any;
        setSettings({
          ...defaultSettings,
          ...loadedSettings,
          profile: {
            ...defaultSettings.profile,
            fullName: profile?.full_name || '',
            ...loadedSettings.profile
          }
        });
      } else {
        setSettings({
          ...defaultSettings,
          profile: {
            ...defaultSettings.profile,
            fullName: profile?.full_name || ''
          }
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = (section: keyof UserSettings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert([{
          user_id: user.id,
          settings: settings as any
        }]);

      if (error) throw error;
      
      toast.success('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings({
      ...defaultSettings,
      profile: {
        ...defaultSettings.profile,
        fullName: profile?.full_name || ''
      }
    });
    toast.info('Settings reset to defaults');
  };

  if (loading) {
    return (
      <div className="animate-slide-up space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account and application preferences.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={settings.profile.fullName}
                  onChange={(e) => updateSettings('profile', 'fullName', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="college">College</Label>
                <Input
                  id="college"
                  placeholder="e.g., College of Education"
                  value={settings.profile.college}
                  onChange={(e) => updateSettings('profile', 'college', e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="subject">Primary Subject</Label>
              <Input
                id="subject"
                placeholder="e.g., Computer Science"
                value={settings.profile.subject}
                onChange={(e) => updateSettings('profile', 'subject', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="test-notifications">Test notifications</Label>
                <p className="text-sm text-muted-foreground">Receive alerts when tests are generated or completed</p>
              </div>
              <Switch 
                id="test-notifications" 
                checked={settings.notifications.testNotifications}
                onCheckedChange={(checked) => updateSettings('notifications', 'testNotifications', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="ai-updates">AI classification updates</Label>
                <p className="text-sm text-muted-foreground">Get notified when AI classifies questions</p>
              </div>
              <Switch 
                id="ai-updates" 
                checked={settings.notifications.aiUpdates}
                onCheckedChange={(checked) => updateSettings('notifications', 'aiUpdates', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="collaboration-alerts">Collaboration alerts</Label>
                <p className="text-sm text-muted-foreground">Receive notifications for collaborative work</p>
              </div>
              <Switch 
                id="collaboration-alerts" 
                checked={settings.notifications.collaborationAlerts}
                onCheckedChange={(checked) => updateSettings('notifications', 'collaborationAlerts', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* AI Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              AI Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-classify">Automatic question classification</Label>
                <p className="text-sm text-muted-foreground">Automatically classify questions using AI</p>
              </div>
              <Switch 
                id="auto-classify" 
                checked={settings.ai.autoClassify}
                onCheckedChange={(checked) => updateSettings('ai', 'autoClassify', checked)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>AI Confidence Threshold</Label>
              <div className="flex items-center gap-4">
                <Input
                  type="range"
                  min="0.5"
                  max="1"
                  step="0.1"
                  value={settings.ai.confidenceThreshold}
                  onChange={(e) => updateSettings('ai', 'confidenceThreshold', parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground min-w-[40px]">
                  {Math.round(settings.ai.confidenceThreshold * 100)}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Questions below this confidence level will be flagged for review
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-approve">Auto-approve high confidence questions</Label>
                <p className="text-sm text-muted-foreground">Automatically approve questions with high AI confidence</p>
              </div>
              <Switch 
                id="auto-approve" 
                checked={settings.ai.autoApprove}
                onCheckedChange={(checked) => updateSettings('ai', 'autoApprove', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Display Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="theme">Theme</Label>
              <Select value={settings.display.theme} onValueChange={(value: any) => updateSettings('display', 'theme', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="compact-mode">Compact mode</Label>
                <p className="text-sm text-muted-foreground">Use more condensed layouts to fit more content</p>
              </div>
              <Switch 
                id="compact-mode" 
                checked={settings.display.compactMode}
                onCheckedChange={(checked) => updateSettings('display', 'compactMode', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-primary">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
          <Button variant="outline" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
